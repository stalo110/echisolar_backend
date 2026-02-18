"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOrderByPaymentReference = exports.getUserOrders = exports.getOrderById = exports.initiateCheckout = void 0;
const db_1 = require("../config/db");
const mailer_1 = require("../utils/mailer");
const installmentService_1 = require("../services/installmentService");
const paymentFactory_1 = require("../services/paymentFactory");
const paymentLogger_1 = require("../utils/paymentLogger");
const getOrderUserId = (req) => req.user.userId;
const paymentDispatcher = (0, paymentFactory_1.createPaymentDispatcher)();
const toAmount = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};
const getBackendBaseUrl = (req) => {
    const explicit = process.env.PAYMENT_VERIFY_BASE_URL ||
        process.env.APP_URL ||
        process.env.BACKEND_PUBLIC_URL;
    if (explicit)
        return String(explicit).replace(/\/$/, '');
    const proto = String(req.headers['x-forwarded-proto'] || '')
        .split(',')[0]
        .trim() || req.protocol;
    const host = String(req.headers['x-forwarded-host'] || '')
        .split(',')[0]
        .trim() || req.get('host') || '';
    return host ? `${proto}://${host}` : '';
};
const upsertGatewaySubscription = async (params) => {
    const planReference = String(params.planReference || '').trim();
    if (!planReference)
        return;
    const [rows] = await db_1.db.query('SELECT id FROM gatewaySubscriptions WHERE orderId = ? AND provider = ? AND planReference = ? LIMIT 1', [params.orderId, params.provider, planReference]);
    const existing = rows[0];
    const metadata = params.metadata ? JSON.stringify(params.metadata) : null;
    if (existing) {
        await db_1.db.query(`UPDATE gatewaySubscriptions
       SET userId = ?, customerEmail = ?, status = ?, metadata = ?
       WHERE id = ?`, [params.userId, params.customerEmail, 'active', metadata, existing.id]);
        return;
    }
    await db_1.db.query(`INSERT INTO gatewaySubscriptions
      (orderId, userId, provider, planReference, customerEmail, status, metadata)
     VALUES (?,?,?,?,?,?,?)`, [
        params.orderId,
        params.userId,
        params.provider,
        planReference,
        params.customerEmail,
        'active',
        metadata,
    ]);
};
const initiateCheckout = async (req, res) => {
    const userId = getOrderUserId(req);
    const { shippingAddressId, providerPreference = 'AUTO', planOption = 'full', currency = 'usd' } = req.body;
    try {
        const backendBaseUrl = getBackendBaseUrl(req);
        const paystackCallbackUrl = `${backendBaseUrl}/verify-payment?gateway=paystack`;
        const flutterwaveRedirectUrl = `${backendBaseUrl}/verify-payment?gateway=flutterwave`;
        const [cartRows] = await db_1.db.query('SELECT id FROM carts WHERE userId = ?', [userId]);
        const cart = cartRows[0];
        if (!cart)
            return res.status(400).json({ error: 'Cart empty' });
        const [items] = await db_1.db.query(`SELECT ci.id, ci.quantity, p.id as productId, p.name, COALESCE(p.salePrice,p.price) as unitPrice, p.stock
       FROM cartItems ci JOIN products p ON p.id = ci.productId WHERE ci.cartId = ?`, [cart.id]);
        const cartItems = items;
        if (!cartItems.length)
            return res.status(400).json({ error: 'Cart empty' });
        for (const it of cartItems) {
            if (it.quantity > it.stock)
                return res.status(400).json({ error: `Not enough stock for ${it.name}` });
        }
        const subtotal = cartItems.reduce((sum, it) => sum + toAmount(it.unitPrice) * toAmount(it.quantity), 0);
        const shipping = 0;
        const total = Number((subtotal + shipping).toFixed(2));
        const [userRows] = await db_1.db.query('SELECT country, email FROM users WHERE id = ?', [userId]);
        const user = userRows[0];
        const userEmail = user?.email ?? '';
        if (!userEmail)
            return res.status(400).json({ error: 'User email is required for checkout' });
        const [orderRes] = await db_1.db.query('INSERT INTO orders (userId, totalAmount, paymentStatus, status, shippingAddressId) VALUES (?,?,?,?,?)', [
            userId,
            total,
            'pending',
            'pending',
            shippingAddressId || null,
        ]);
        const orderId = orderRes.insertId;
        for (const it of cartItems) {
            await db_1.db.query('INSERT INTO orderItems (orderId, productId, quantity, unitPrice) VALUES (?,?,?,?)', [orderId, it.productId, it.quantity, it.unitPrice]);
            await db_1.db.query('UPDATE products SET stock = stock - ? WHERE id = ?', [it.quantity, it.productId]);
        }
        await db_1.db.query('DELETE FROM cartItems WHERE cartId = ?', [cart.id]);
        const preference = String(providerPreference || 'AUTO').toLowerCase();
        let provider = 'flutterwave';
        if (preference === 'paystack') {
            provider = 'paystack';
        }
        else if (preference === 'flutterwave') {
            provider = 'flutterwave';
        }
        else if (user && (String(user.country).toLowerCase() === 'nigeria' || String(user.country).toLowerCase() === 'ng')) {
            provider = 'paystack';
        }
        const normalizedCurrency = String(currency || 'usd').toUpperCase();
        const itemsForEmail = cartItems.map((it) => ({
            name: it.name,
            quantity: toAmount(it.quantity),
            unitPrice: toAmount(it.unitPrice),
        }));
        const sendOrderEmail = (checkoutUrl, amount, installments) => (0, mailer_1.notifyOrderStakeholders)({
            orderId,
            customerEmail: userEmail,
            provider,
            currency: normalizedCurrency,
            total: amount,
            checkoutUrl,
            items: itemsForEmail,
            installments,
        });
        if (planOption !== 'full') {
            const months = Number(planOption);
            if (!Number.isInteger(months) || ![2, 4, 6].includes(months)) {
                return res.status(400).json({ error: 'Invalid installment option. Use 2, 4, or 6 months.' });
            }
            const schedule = (0, installmentService_1.calculateInstallments)(total, months);
            for (const s of schedule) {
                await db_1.db.query('INSERT INTO installments (orderId, installmentNumber, dueDate, amount, status) VALUES (?,?,?,?,?)', [
                    orderId,
                    s.installmentNumber,
                    s.dueDate,
                    s.amount,
                    'pending',
                ]);
            }
            const first = schedule[0];
            const recurringPlanName = `EchiSolar Order #${orderId} (${months} months)`;
            const recurringPlan = await paymentDispatcher.createRecurringPlan(provider, {
                name: recurringPlanName,
                amount: first.amount,
                interval: 'monthly',
                currency: normalizedCurrency,
                duration: months,
                invoiceLimit: months,
            });
            const planMetadata = {
                installment: 1,
                installment_months: months,
                ...(recurringPlan.planCode ? { subscription_plan_code: recurringPlan.planCode } : {}),
                ...(recurringPlan.paymentPlanId ? { subscription_plan_id: recurringPlan.paymentPlanId } : {}),
            };
            await upsertGatewaySubscription({
                orderId,
                userId,
                provider,
                planReference: recurringPlan.planCode || recurringPlan.paymentPlanId,
                customerEmail: userEmail,
                metadata: {
                    orderId,
                    provider,
                    months,
                    schedule,
                    plan: recurringPlan.raw ?? null,
                },
            });
            if (provider === 'flutterwave') {
                const data = await paymentDispatcher.initiate({ id: orderId, userId, totalAmount: first.amount }, 'flutterwave', userEmail, normalizedCurrency, planMetadata, { paymentPlanId: recurringPlan.paymentPlanId, redirectUrl: flutterwaveRedirectUrl });
                await db_1.db.query('INSERT INTO payments (orderId, provider, paymentIntentId, amount, currency, status) VALUES (?,?,?,?,?,?)', [
                    orderId,
                    'flutterwave',
                    data.reference,
                    first.amount,
                    normalizedCurrency,
                    'pending',
                ]);
                await sendOrderEmail(data.link, first.amount, schedule);
                return res.json({
                    orderId,
                    provider,
                    authorization_url: data.link,
                    tx_ref: data.reference,
                    amount: first.amount,
                    currency: normalizedCurrency,
                    subscription_plan_id: recurringPlan.paymentPlanId || null,
                });
            }
            else {
                const data = await paymentDispatcher.initiate({ id: orderId, userId, totalAmount: first.amount }, 'paystack', userEmail, normalizedCurrency, planMetadata, { planCode: recurringPlan.planCode, callbackUrl: paystackCallbackUrl });
                await db_1.db.query('INSERT INTO payments (orderId, provider, paymentIntentId, amount, currency, status) VALUES (?,?,?,?,?,?)', [
                    orderId,
                    'paystack',
                    data.reference,
                    first.amount,
                    normalizedCurrency,
                    'pending',
                ]);
                await sendOrderEmail(data.authorization_url, first.amount, schedule);
                return res.json({
                    orderId,
                    provider,
                    authorization_url: data.authorization_url,
                    reference: data.reference,
                    amount: first.amount,
                    currency: normalizedCurrency,
                    subscription_plan_code: recurringPlan.planCode || null,
                });
            }
        }
        else {
            if (provider === 'flutterwave') {
                const data = await paymentDispatcher.initiate({ id: orderId, userId, totalAmount: total }, 'flutterwave', userEmail, normalizedCurrency, {}, { redirectUrl: flutterwaveRedirectUrl });
                await db_1.db.query('INSERT INTO payments (orderId, provider, paymentIntentId, amount, currency, status) VALUES (?,?,?,?,?,?)', [
                    orderId,
                    'flutterwave',
                    data.reference,
                    total,
                    normalizedCurrency,
                    'pending',
                ]);
                await sendOrderEmail(data.link, total);
                return res.json({
                    orderId,
                    provider,
                    authorization_url: data.link,
                    tx_ref: data.reference,
                    amount: total,
                    currency: normalizedCurrency,
                });
            }
            else {
                const data = await paymentDispatcher.initiate({ id: orderId, userId, totalAmount: total }, 'paystack', userEmail, normalizedCurrency, {}, { callbackUrl: paystackCallbackUrl });
                await db_1.db.query('INSERT INTO payments (orderId, provider, paymentIntentId, amount, currency, status) VALUES (?,?,?,?,?,?)', [
                    orderId,
                    'paystack',
                    data.reference,
                    total,
                    normalizedCurrency,
                    'pending',
                ]);
                await sendOrderEmail(data.authorization_url, total);
                return res.json({
                    orderId,
                    provider,
                    authorization_url: data.authorization_url,
                    reference: data.reference,
                    amount: total,
                    currency: normalizedCurrency,
                });
            }
        }
    }
    catch (err) {
        (0, paymentLogger_1.logPayment)('checkout.error', { error: err.message });
        res.status(500).json({ error: err.message || 'Server error' });
    }
};
exports.initiateCheckout = initiateCheckout;
const getOrderById = async (req, res) => {
    const userId = req.user.userId;
    const id = Number(req.params.id);
    try {
        const [rows] = await db_1.db.query('SELECT * FROM orders WHERE id = ?', [id]);
        const order = rows[0];
        if (!order)
            return res.status(404).json({ error: 'Not found' });
        if (req.user.role !== 'admin' && order.userId !== userId)
            return res.status(403).json({ error: 'Forbidden' });
        const [items] = await db_1.db.query('SELECT oi.*, p.name, p.images FROM orderItems oi JOIN products p ON p.id = oi.productId WHERE oi.orderId = ?', [id]);
        const [payments] = await db_1.db.query('SELECT * FROM payments WHERE orderId = ?', [id]);
        const [installments] = await db_1.db.query('SELECT * FROM installments WHERE orderId = ?', [id]);
        res.json({ order, items, payments, installments });
    }
    catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
};
exports.getOrderById = getOrderById;
const getUserOrders = async (req, res) => {
    const userId = req.user.userId;
    try {
        const [orders] = await db_1.db.query('SELECT * FROM orders WHERE userId = ? ORDER BY placedAt DESC', [userId]);
        res.json(orders);
    }
    catch {
        res.status(500).json({ error: 'Server error' });
    }
};
exports.getUserOrders = getUserOrders;
const getOrderByPaymentReference = async (req, res) => {
    const userId = req.user.userId;
    const reference = String(req.query.reference || '').trim();
    if (!reference)
        return res.status(400).json({ error: 'Missing reference' });
    try {
        const [rows] = await db_1.db.query('SELECT o.id, o.userId FROM payments p JOIN orders o ON o.id = p.orderId WHERE p.paymentIntentId = ? LIMIT 1', [reference]);
        const match = rows[0];
        if (!match)
            return res.status(404).json({ error: 'Not found' });
        if (req.user.role !== 'admin' && match.userId !== userId)
            return res.status(403).json({ error: 'Forbidden' });
        const [orderRows] = await db_1.db.query('SELECT * FROM orders WHERE id = ?', [match.id]);
        const order = orderRows[0];
        const [items] = await db_1.db.query('SELECT oi.*, p.name, p.images FROM orderItems oi JOIN products p ON p.id = oi.productId WHERE oi.orderId = ?', [match.id]);
        const [payments] = await db_1.db.query('SELECT * FROM payments WHERE orderId = ?', [match.id]);
        const [installments] = await db_1.db.query('SELECT * FROM installments WHERE orderId = ?', [match.id]);
        res.json({ order, items, payments, installments });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
};
exports.getOrderByPaymentReference = getOrderByPaymentReference;
//# sourceMappingURL=orderController.js.map