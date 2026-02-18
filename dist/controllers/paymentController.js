"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPaymentConfig = exports.getTransactionByReference = exports.verifyPayment = exports.initializePayment = void 0;
const db_1 = require("../config/db");
const paymentFactory_1 = require("../services/paymentFactory");
const paymentLogger_1 = require("../utils/paymentLogger");
const dispatcher = (0, paymentFactory_1.createPaymentDispatcher)();
const { transactions, paystack, flutterwave } = (0, paymentFactory_1.createPaymentServices)();
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
const initializePayment = async (req, res) => {
    try {
        const { orderId, gateway, email, currency = 'NGN' } = req.body;
        if (!orderId || !gateway)
            return res.status(400).json({ error: 'Missing orderId or gateway' });
        const [rows] = await db_1.db.query('SELECT id, userId, totalAmount FROM orders WHERE id = ? LIMIT 1', [orderId]);
        const order = rows[0];
        if (!order)
            return res.status(404).json({ error: 'Order not found' });
        if (req.user?.userId && order.userId !== req.user.userId)
            return res.status(403).json({ error: 'Forbidden' });
        const userEmail = email || req.user?.email;
        if (!userEmail)
            return res.status(400).json({ error: 'Email is required' });
        const backendBaseUrl = getBackendBaseUrl(req);
        const paystackCallbackUrl = `${backendBaseUrl}/verify-payment?gateway=paystack`;
        const flutterwaveRedirectUrl = `${backendBaseUrl}/verify-payment?gateway=flutterwave`;
        const result = await dispatcher.initiate({ id: order.id, userId: order.userId, totalAmount: Number(order.totalAmount) }, gateway, userEmail, currency, {}, gateway === 'paystack'
            ? { callbackUrl: paystackCallbackUrl }
            : { redirectUrl: flutterwaveRedirectUrl });
        const reference = result.reference;
        await db_1.db.query('INSERT INTO payments (orderId, provider, paymentIntentId, amount, currency, status) VALUES (?,?,?,?,?,?)', [
            orderId,
            gateway,
            reference,
            order.totalAmount,
            currency,
            'pending',
        ]);
        (0, paymentLogger_1.logPayment)('initialize.endpoint.success', { orderId, gateway, reference });
        return res.json({ ok: true, data: result });
    }
    catch (err) {
        (0, paymentLogger_1.logPayment)('initialize.endpoint.error', { error: err.message });
        return res.status(500).json({ error: err.message || 'Payment initialization failed' });
    }
};
exports.initializePayment = initializePayment;
const verifyPayment = async (req, res) => {
    const rawSearch = String(req.originalUrl || '').split('?')[1] || '';
    const rawParams = new URLSearchParams(rawSearch);
    const normalizeKey = (key) => String(key || '')
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, '_');
    const compactKey = (key) => normalizeKey(key).replace(/_/g, '');
    const valuesByKey = new Map();
    const setValue = (rawKey, rawValue) => {
        if (rawValue === null || rawValue === undefined)
            return;
        const key = normalizeKey(rawKey);
        if (!key)
            return;
        const value = String(rawValue).trim();
        if (!value)
            return;
        const compact = compactKey(key);
        if (!valuesByKey.has(key))
            valuesByKey.set(key, value);
        if (!valuesByKey.has(compact))
            valuesByKey.set(compact, value);
    };
    for (const [key, rawValue] of Object.entries((req.query || {}))) {
        if (Array.isArray(rawValue)) {
            for (const value of rawValue)
                setValue(key, value);
        }
        else {
            setValue(key, rawValue);
        }
    }
    for (const [key, value] of rawParams.entries()) {
        setValue(key, value);
    }
    const pick = (...keys) => {
        for (const key of keys) {
            const normalized = normalizeKey(key);
            const compact = compactKey(key);
            const value = valuesByKey.get(normalized) || valuesByKey.get(compact);
            if (value)
                return value;
        }
        return '';
    };
    const normalizeGateway = (value) => {
        const normalized = normalizeKey(value);
        if (normalized === 'paystack' || normalized === 'pay_stack')
            return 'paystack';
        if (normalized === 'flutterwave' || normalized === 'flutter_wave' || normalized === 'flw')
            return 'flutterwave';
        return '';
    };
    const reference = pick('reference', 'ref', 'tx_ref', 'txref', 'trxref');
    const transactionId = pick('transaction_id', 'transactionid', 'flw_transaction_id');
    const gatewayInput = pick('gateway', 'payment_gateway', 'provider');
    let gateway = normalizeGateway(gatewayInput);
    if (!gateway) {
        const upperRef = reference.toUpperCase();
        if (upperRef.startsWith('PAY-'))
            gateway = 'paystack';
        else if (upperRef.startsWith('FLW-') || transactionId)
            gateway = 'flutterwave';
    }
    const verificationReference = gateway === 'flutterwave' ? transactionId || reference : reference;
    const redirectReference = reference || transactionId || '';
    if (!verificationReference || !gateway) {
        (0, paymentLogger_1.logPayment)('verify.endpoint.missing_params', {
            rawSearch,
            parsed: {
                reference,
                transactionId,
                gatewayInput,
                gateway,
            },
            queryKeys: Object.keys((req.query || {})),
        });
        return res.status(400).json({ error: 'Reference and gateway are required' });
    }
    try {
        const result = await dispatcher.verify(verificationReference, gateway);
        const redirectBase = process.env.FRONTEND_URL || '/';
        if (result.success) {
            return res.redirect(`${redirectBase}/order/success?ref=${encodeURIComponent(redirectReference || verificationReference)}`);
        }
        return res.redirect(`${redirectBase}/order/failed?ref=${encodeURIComponent(redirectReference || verificationReference)}`);
    }
    catch (err) {
        (0, paymentLogger_1.logPayment)('verify.endpoint.error', {
            reference: redirectReference || verificationReference,
            verificationReference,
            gateway,
            error: err.message,
        });
        const redirectBase = process.env.FRONTEND_URL || '/';
        return res.redirect(`${redirectBase}/order/failed?ref=${encodeURIComponent(redirectReference || verificationReference)}`);
    }
};
exports.verifyPayment = verifyPayment;
const getTransactionByReference = async (req, res) => {
    const reference = String(req.params.reference || '').trim();
    if (!reference)
        return res.status(400).json({ error: 'Missing reference' });
    try {
        const gateway = reference.startsWith('PAY-') ? 'paystack' : reference.startsWith('FLW-') ? 'flutterwave' : null;
        const record = await transactions.findByReference(reference);
        if (!record)
            return res.status(404).json({ error: 'Transaction not found' });
        let freshStatus = null;
        if (req.query.fresh === 'true' && gateway) {
            try {
                if (gateway === 'paystack') {
                    const verify = await paystack.verify(reference);
                    freshStatus = verify.data;
                }
                else if (gateway === 'flutterwave') {
                    const verify = await flutterwave.verify(reference);
                    freshStatus = verify.data;
                }
            }
            catch (err) {
                (0, paymentLogger_1.logPayment)('admin.lookup.fresh.error', { reference, error: err.message });
            }
        }
        return res.json({
            ok: true,
            data: {
                ...record,
                gateway,
                fresh_status: freshStatus,
            },
        });
    }
    catch (err) {
        (0, paymentLogger_1.logPayment)('admin.lookup.error', { reference, error: err.message });
        return res.status(500).json({ error: 'Failed to fetch transaction' });
    }
};
exports.getTransactionByReference = getTransactionByReference;
const getPaymentConfig = async (_req, res) => {
    const paystackPublicKey = process.env.PAYSTACK_PUBLIC_KEY || '';
    const flutterwavePublicKey = process.env.FLUTTERWAVE_PUBLIC_KEY || '';
    (0, paymentLogger_1.logPayment)('config.fetch', { paystack: Boolean(paystackPublicKey), flutterwave: Boolean(flutterwavePublicKey) });
    return res.json({
        ok: true,
        data: {
            paystackPublicKey,
            flutterwavePublicKey,
        },
    });
};
exports.getPaymentConfig = getPaymentConfig;
//# sourceMappingURL=paymentController.js.map