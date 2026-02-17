"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = require("../utils/http");
const db_1 = require("../config/db");
const paymentLogger_1 = require("../utils/paymentLogger");
class FlutterwaveService {
    constructor(transactions, request = http_1.fetchWithTimeout) {
        this.transactions = transactions;
        this.request = request;
        this.baseUrl = 'https://api.flutterwave.com/v3';
        this.secretKey = process.env.FLUTTERWAVE_SECRET_KEY || '';
        this.secretHash = process.env.FLUTTERWAVE_SECRET_HASH || '';
    }
    async initialize(order, email, currency, metadata = {}) {
        if (!this.secretKey)
            throw new Error('Missing Flutterwave secret key');
        let reference = `FLW-${order.id}-${Date.now()}`;
        while (await this.transactions.exists(reference)) {
            reference = `${reference}-${Date.now()}`;
        }
        const payload = {
            tx_ref: reference,
            amount: Number(order.totalAmount).toFixed(2),
            currency: currency || 'NGN',
            redirect_url: `${process.env.APP_URL || process.env.FRONTEND_URL || ''}/verify-payment?gateway=flutterwave`,
            customer: { email },
            meta: { order_id: order.id, ...metadata },
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
    async verify(reference) {
        if (!this.secretKey)
            throw new Error('Missing Flutterwave secret key');
        (0, paymentLogger_1.logPayment)('flutterwave.verify.request', { reference });
        try {
            const res = await this.request(`${this.baseUrl}/transactions/${reference}/verify`, {
                method: 'GET',
                headers: { Authorization: `Bearer ${this.secretKey}` },
            });
            const json = await res.json();
            if (json.status !== 'success') {
                (0, paymentLogger_1.logPayment)('flutterwave.verify.failed', { reference, response: json });
                throw new Error(json.message || 'Flutterwave verification failed');
            }
            const transaction = await this.transactions.findByReference(reference);
            if (!transaction)
                throw new Error(`Transaction not found: ${reference}`);
            const isSuccessful = json.data?.status === 'successful';
            const paidAmount = Number(json.data?.amount || 0);
            if (isSuccessful && paidAmount !== Number(transaction.amount)) {
                (0, paymentLogger_1.logPayment)('flutterwave.verify.amount_mismatch', {
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
            (0, paymentLogger_1.logPayment)('flutterwave.verify.success', { reference, isSuccessful });
            return { success: isSuccessful, data: json.data };
        }
        catch (err) {
            if (err.name === 'AbortError') {
                (0, paymentLogger_1.logPayment)('flutterwave.verify.timeout', { reference });
                throw new Error('Payment gateway timeout. Please try again.');
            }
            (0, paymentLogger_1.logPayment)('flutterwave.verify.error', { reference, error: err.message });
            throw err;
        }
    }
    validateWebhookSignature(signature) {
        if (!signature || !this.secretHash)
            return false;
        return signature === this.secretHash;
    }
    getGateway() {
        return 'flutterwave';
    }
}
exports.default = FlutterwaveService;
