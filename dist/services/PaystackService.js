"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const crypto_1 = __importDefault(require("crypto"));
const http_1 = require("../utils/http");
const db_1 = require("../config/db");
const paymentLogger_1 = require("../utils/paymentLogger");
class PaystackService {
    constructor(transactions, request = http_1.fetchWithTimeout) {
        this.transactions = transactions;
        this.request = request;
        this.baseUrl = 'https://api.paystack.co';
        this.secretKey = process.env.PAYSTACK_SECRET_KEY || '';
    }
    async initialize(order, email, currency, metadata = {}, options = {}) {
        if (!this.secretKey)
            throw new Error('Missing Paystack secret key');
        let reference = `PAY-${order.id}-${Date.now()}`;
        while (await this.transactions.exists(reference)) {
            reference = `${reference}-${Date.now()}`;
        }
        const payload = {
            email,
            amount: Math.round(order.totalAmount * 100),
            currency: String(currency || 'NGN').toUpperCase(),
            reference,
            callback_url: `${process.env.APP_URL || process.env.FRONTEND_URL || ''}/verify-payment?gateway=paystack`,
            metadata: { order_id: order.id, ...metadata },
            ...(options.planCode ? { plan: options.planCode } : {}),
        };
        (0, paymentLogger_1.logPayment)('paystack.initialize.request', { orderId: order.id, reference, payload });
        try {
            const res = await this.request(`${this.baseUrl}/transaction/initialize`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${this.secretKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });
            const json = await res.json();
            if (!json.status) {
                (0, paymentLogger_1.logPayment)('paystack.initialize.failed', { reference, response: json });
                throw new Error(json.message || 'Paystack initialization failed');
            }
            await this.transactions.create({
                order_id: order.id,
                user_id: order.userId,
                reference,
                gateway: 'paystack',
                amount: order.totalAmount,
                currency,
                status: 'pending',
                metadata: { gateway_response: json, metadata },
            });
            (0, paymentLogger_1.logPayment)('paystack.initialize.success', {
                reference,
                authorization_url: json.data?.authorization_url,
            });
            return {
                authorization_url: json.data?.authorization_url,
                reference,
            };
        }
        catch (err) {
            if (err.name === 'AbortError') {
                (0, paymentLogger_1.logPayment)('paystack.initialize.timeout', { reference });
                throw new Error('Payment gateway timeout. Please try again.');
            }
            (0, paymentLogger_1.logPayment)('paystack.initialize.error', { reference, error: err.message });
            throw err;
        }
    }
    async createPlan(input) {
        if (!this.secretKey)
            throw new Error('Missing Paystack secret key');
        const payload = {
            name: input.name,
            amount: Math.round(Number(input.amount) * 100),
            interval: input.interval,
            currency: String(input.currency || 'NGN').toUpperCase(),
            ...(input.invoiceLimit ? { invoice_limit: input.invoiceLimit } : {}),
        };
        (0, paymentLogger_1.logPayment)('paystack.plan.create.request', { payload });
        const res = await this.request(`${this.baseUrl}/plan`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${this.secretKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (!json.status || !json.data?.plan_code) {
            (0, paymentLogger_1.logPayment)('paystack.plan.create.failed', { response: json });
            throw new Error(json.message || 'Unable to create Paystack plan');
        }
        (0, paymentLogger_1.logPayment)('paystack.plan.create.success', {
            plan_code: json.data.plan_code,
            id: json.data.id,
        });
        return {
            planCode: json.data.plan_code,
            id: Number(json.data.id),
            raw: json.data,
        };
    }
    async verify(reference) {
        if (!this.secretKey)
            throw new Error('Missing Paystack secret key');
        (0, paymentLogger_1.logPayment)('paystack.verify.request', { reference });
        try {
            const res = await this.request(`${this.baseUrl}/transaction/verify/${reference}`, {
                method: 'GET',
                headers: { Authorization: `Bearer ${this.secretKey}` },
            });
            const json = await res.json();
            if (!json.status) {
                (0, paymentLogger_1.logPayment)('paystack.verify.failed', { reference, response: json });
                throw new Error(json.message || 'Paystack verification failed');
            }
            const transaction = await this.transactions.findByReference(reference);
            if (!transaction)
                throw new Error(`Transaction not found: ${reference}`);
            const isSuccessful = json.data?.status === 'success';
            const paidAmount = Number(json.data?.amount || 0) / 100;
            if (isSuccessful && paidAmount !== Number(transaction.amount)) {
                (0, paymentLogger_1.logPayment)('paystack.verify.amount_mismatch', {
                    reference,
                    expected: transaction.amount,
                    received: paidAmount,
                });
                throw new Error('Payment amount mismatch');
            }
            await this.transactions.updateStatus(reference, isSuccessful ? 'success' : 'failed', {
                ...transaction.metadata,
                verification_response: json,
            });
            if (isSuccessful) {
                await db_1.db.query('UPDATE orders SET paymentStatus = ?, status = ? WHERE id = ?', ['paid', 'processing', transaction.order_id]);
                await db_1.db.query('UPDATE payments SET status = ? WHERE paymentIntentId = ?', ['success', reference]);
            }
            (0, paymentLogger_1.logPayment)('paystack.verify.success', { reference, isSuccessful });
            return { success: isSuccessful, data: json.data };
        }
        catch (err) {
            if (err.name === 'AbortError') {
                (0, paymentLogger_1.logPayment)('paystack.verify.timeout', { reference });
                throw new Error('Payment gateway timeout. Please try again.');
            }
            (0, paymentLogger_1.logPayment)('paystack.verify.error', { reference, error: err.message });
            throw err;
        }
    }
    validateWebhookSignature(rawBody, signature) {
        if (!rawBody || !signature)
            return false;
        const hash = crypto_1.default.createHmac('sha512', this.secretKey).update(rawBody).digest('hex');
        return hash === signature;
    }
    getGateway() {
        return 'paystack';
    }
}
exports.default = PaystackService;
