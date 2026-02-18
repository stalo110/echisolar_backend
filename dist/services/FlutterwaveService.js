"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const crypto_1 = __importDefault(require("crypto"));
const http_1 = require("../utils/http");
const db_1 = require("../config/db");
const paymentLogger_1 = require("../utils/paymentLogger");
class FlutterwaveService {
    constructor(transactions, request = http_1.fetchWithTimeout) {
        this.transactions = transactions;
        this.request = request;
        this.baseUrl = 'https://api.flutterwave.com/v3';
        this.secretKey = process.env.FLUTTERWAVE_SECRET_KEY || '';
        this.secretHash = process.env.FLUTTERWAVE_SECRET_HASH || process.env.FLUTTERWAVE_WEBHOOK_HASH || '';
    }
    async initialize(order, email, currency, metadata = {}, options = {}) {
        if (!this.secretKey)
            throw new Error('Missing Flutterwave secret key');
        let reference = `FLW-${order.id}-${Date.now()}`;
        while (await this.transactions.exists(reference)) {
            reference = `${reference}-${Date.now()}`;
        }
        const defaultRedirect = `${process.env.APP_URL || process.env.BACKEND_PUBLIC_URL || process.env.FRONTEND_URL || ''}/verify-payment?gateway=flutterwave`;
        const payload = {
            tx_ref: reference,
            amount: Number(order.totalAmount),
            currency: String(currency || 'NGN').toUpperCase(),
            redirect_url: options.redirectUrl || defaultRedirect,
            customer: { email },
            meta: { order_id: order.id, ...metadata },
            ...(options.paymentPlanId ? { payment_plan: options.paymentPlanId } : {}),
        };
        (0, paymentLogger_1.logPayment)('flutterwave.initialize.request', { orderId: order.id, reference, payload });
        try {
            const res = await this.request(`${this.baseUrl}/payments`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${this.secretKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });
            const json = await res.json();
            if (json.status !== 'success') {
                (0, paymentLogger_1.logPayment)('flutterwave.initialize.failed', { reference, response: json });
                throw new Error(json.message || 'Flutterwave initialization failed');
            }
            await this.transactions.create({
                order_id: order.id,
                user_id: order.userId,
                reference,
                gateway: 'flutterwave',
                amount: order.totalAmount,
                currency: currency || 'NGN',
                status: 'pending',
                metadata: { gateway_response: json, metadata },
            });
            (0, paymentLogger_1.logPayment)('flutterwave.initialize.success', { reference, link: json.data?.link });
            return {
                link: json.data?.link,
                reference,
            };
        }
        catch (err) {
            if (err.name === 'AbortError') {
                (0, paymentLogger_1.logPayment)('flutterwave.initialize.timeout', { reference });
                throw new Error('Payment gateway timeout. Please try again.');
            }
            (0, paymentLogger_1.logPayment)('flutterwave.initialize.error', { reference, error: err.message });
            throw err;
        }
    }
    async createPaymentPlan(input) {
        if (!this.secretKey)
            throw new Error('Missing Flutterwave secret key');
        const payload = {
            name: input.name,
            amount: Number(input.amount),
            interval: input.interval,
            currency: String(input.currency || 'NGN').toUpperCase(),
            ...(input.duration ? { duration: input.duration } : {}),
        };
        (0, paymentLogger_1.logPayment)('flutterwave.plan.create.request', { payload });
        const res = await this.request(`${this.baseUrl}/payment-plans`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${this.secretKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (json.status !== 'success' || !json.data?.id) {
            (0, paymentLogger_1.logPayment)('flutterwave.plan.create.failed', { response: json });
            throw new Error(json.message || 'Unable to create Flutterwave payment plan');
        }
        (0, paymentLogger_1.logPayment)('flutterwave.plan.create.success', { id: json.data.id });
        return {
            id: String(json.data.id),
            raw: json.data,
        };
    }
    async verify(reference) {
        if (!this.secretKey)
            throw new Error('Missing Flutterwave secret key');
        const identifier = String(reference || '').trim();
        if (!identifier)
            throw new Error('Missing Flutterwave verification reference');
        (0, paymentLogger_1.logPayment)('flutterwave.verify.request', { reference: identifier });
        try {
            const headers = { Authorization: `Bearer ${this.secretKey}` };
            const byId = async () => {
                const res = await this.request(`${this.baseUrl}/transactions/${encodeURIComponent(identifier)}/verify`, {
                    method: 'GET',
                    headers,
                });
                return res.json();
            };
            const byTxRef = async () => {
                const res = await this.request(`${this.baseUrl}/transactions/verify_by_reference?tx_ref=${encodeURIComponent(identifier)}`, {
                    method: 'GET',
                    headers,
                });
                return res.json();
            };
            const attempts = /^\d+$/.test(identifier) ? [byId, byTxRef] : [byTxRef, byId];
            let json = null;
            let lastResponse = null;
            for (const attempt of attempts) {
                try {
                    const candidate = await attempt();
                    lastResponse = candidate;
                    if (candidate?.status === 'success' && candidate?.data) {
                        json = candidate;
                        break;
                    }
                }
                catch (attemptErr) {
                    lastResponse = { message: attemptErr?.message || 'verification attempt failed' };
                }
            }
            if (!json) {
                (0, paymentLogger_1.logPayment)('flutterwave.verify.failed', { reference: identifier, response: lastResponse });
                throw new Error(lastResponse?.message || 'Flutterwave verification failed');
            }
            const txRef = String(json.data?.tx_ref || identifier).trim();
            const transaction = (await this.transactions.findByReference(txRef)) || (await this.transactions.findByReference(identifier));
            if (!transaction)
                throw new Error(`Transaction not found: ${txRef}`);
            const isSuccessful = json.data?.status === 'successful';
            const paidAmount = Number(json.data?.amount || 0);
            if (isSuccessful && paidAmount !== Number(transaction.amount)) {
                (0, paymentLogger_1.logPayment)('flutterwave.verify.amount_mismatch', {
                    reference: txRef,
                    expected: transaction.amount,
                    received: paidAmount,
                });
                throw new Error('Payment amount mismatch');
            }
            await this.transactions.updateStatus(transaction.reference, isSuccessful ? 'success' : 'failed', {
                ...transaction.metadata,
                verification_identifier: identifier,
                verification_response: json,
            });
            if (isSuccessful) {
                await db_1.db.query('UPDATE orders SET paymentStatus = ?, status = ? WHERE id = ?', ['paid', 'processing', transaction.order_id]);
                await db_1.db.query('UPDATE payments SET status = ? WHERE paymentIntentId = ?', ['success', transaction.reference]);
            }
            (0, paymentLogger_1.logPayment)('flutterwave.verify.success', { reference: txRef, verification_identifier: identifier, isSuccessful });
            return { success: isSuccessful, data: json.data };
        }
        catch (err) {
            if (err.name === 'AbortError') {
                (0, paymentLogger_1.logPayment)('flutterwave.verify.timeout', { reference: identifier });
                throw new Error('Payment gateway timeout. Please try again.');
            }
            (0, paymentLogger_1.logPayment)('flutterwave.verify.error', { reference: identifier, error: err.message });
            throw err;
        }
    }
    constantTimeEquals(a, b) {
        const left = Buffer.from(a, 'utf8');
        const right = Buffer.from(b, 'utf8');
        if (left.length !== right.length)
            return false;
        return crypto_1.default.timingSafeEqual(left, right);
    }
    validateWebhookSignature(rawBody, legacySignature, hmacSignature) {
        const legacy = String(legacySignature || '').trim();
        const hmac = String(hmacSignature || '').trim();
        const legacyValid = !!legacy && !!this.secretHash && this.constantTimeEquals(legacy, String(this.secretHash).trim());
        let hmacValid = false;
        if (rawBody && hmac && this.secretKey) {
            const expected = crypto_1.default.createHmac('sha256', this.secretKey).update(rawBody).digest('hex');
            hmacValid = this.constantTimeEquals(hmac.toLowerCase(), expected.toLowerCase());
        }
        return legacyValid || hmacValid;
    }
    getGateway() {
        return 'flutterwave';
    }
}
exports.default = FlutterwaveService;
