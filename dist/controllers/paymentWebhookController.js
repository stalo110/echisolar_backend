"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.paystackWebhook = exports.flutterwaveWebhook = void 0;
const paymentFactory_1 = require("../services/paymentFactory");
const paymentLogger_1 = require("../utils/paymentLogger");
const db_1 = require("../config/db");
const { transactions, paystack, flutterwave } = (0, paymentFactory_1.createPaymentServices)();
const flutterwaveWebhook = async (req, res) => {
    const signature = req.headers['verif-hash'];
    const payload = req.body;
    (0, paymentLogger_1.logWebhook)('flutterwave.webhook.received', {
        headers: req.headers,
        payload,
    });
    if (!flutterwave.validateWebhookSignature(signature)) {
        (0, paymentLogger_1.logWebhook)('flutterwave.webhook.invalid_signature', { signature_present: !!signature });
        return res.status(401).json({ ok: false, message: 'Invalid signature' });
    }
    try {
        if (payload?.event !== 'charge.completed') {
            return res.status(200).json({ ok: true });
        }
        const data = payload?.data || {};
        if (data.status !== 'successful') {
            return res.status(200).json({ ok: true });
        }
        const reference = data.tx_ref;
        if (!reference)
            return res.status(200).json({ ok: true });
        const existing = await transactions.findByReference(reference);
        if (!existing)
            return res.status(200).json({ ok: true });
        if (existing.status === 'success')
            return res.status(200).json({ ok: true });
        if (Number(data.amount) !== Number(existing.amount)) {
            (0, paymentLogger_1.logWebhook)('flutterwave.webhook.amount_mismatch', {
                reference,
                expected: existing.amount,
                received: data.amount,
            });
            return res.status(200).json({ ok: true });
        }
        await transactions.updateStatus(reference, 'success', {
            ...existing.metadata,
            webhook_payload: data,
        });
        await db_1.db.query('UPDATE orders SET paymentStatus = ?, status = ? WHERE id = ?', [
            'paid',
            'processing',
            existing.order_id,
        ]);
        await db_1.db.query('UPDATE payments SET status = ? WHERE paymentIntentId = ?', ['success', reference]);
        const installment = data.meta?.installment || existing.metadata?.metadata?.installment;
        if (installment) {
            await db_1.db.query('UPDATE installments SET status = ?, paidAt = NOW() WHERE orderId = ? AND installmentNumber = ?', [
                'paid',
                existing.order_id,
                Number(installment),
            ]);
        }
        (0, paymentLogger_1.logWebhook)('flutterwave.webhook.processed', { reference });
        return res.status(200).json({ ok: true });
    }
    catch (err) {
        (0, paymentLogger_1.logWebhook)('flutterwave.webhook.error', { error: err.message });
        return res.status(200).json({ ok: true });
    }
};
exports.flutterwaveWebhook = flutterwaveWebhook;
const paystackWebhook = async (req, res) => {
    const signature = req.headers['x-paystack-signature'];
    const rawBody = req.rawBody;
    const payload = req.body;
    (0, paymentLogger_1.logWebhook)('paystack.webhook.received', {
        headers: req.headers,
        payload,
    });
    if (!paystack.validateWebhookSignature(rawBody, signature)) {
        (0, paymentLogger_1.logWebhook)('paystack.webhook.invalid_signature', { signature_present: !!signature });
        return res.status(401).json({ ok: false, message: 'Invalid signature' });
    }
    try {
        if (payload?.event !== 'charge.success') {
            return res.status(200).json({ ok: true });
        }
        const data = payload?.data || {};
        const reference = data.reference;
        if (!reference)
            return res.status(200).json({ ok: true });
        const existing = await transactions.findByReference(reference);
        if (!existing)
            return res.status(200).json({ ok: true });
        if (existing.status === 'success')
            return res.status(200).json({ ok: true });
        const paidAmount = Number(data.amount) / 100;
        if (paidAmount !== Number(existing.amount)) {
            (0, paymentLogger_1.logWebhook)('paystack.webhook.amount_mismatch', {
                reference,
                expected: existing.amount,
                received: paidAmount,
            });
            return res.status(200).json({ ok: true });
        }
        await transactions.updateStatus(reference, 'success', {
            ...existing.metadata,
            webhook_payload: data,
        });
        await db_1.db.query('UPDATE orders SET paymentStatus = ?, status = ? WHERE id = ?', [
            'paid',
            'processing',
            existing.order_id,
        ]);
        await db_1.db.query('UPDATE payments SET status = ? WHERE paymentIntentId = ?', ['success', reference]);
        const installment = data.metadata?.installment || existing.metadata?.metadata?.installment;
        if (installment) {
            await db_1.db.query('UPDATE installments SET status = ?, paidAt = NOW() WHERE orderId = ? AND installmentNumber = ?', [
                'paid',
                existing.order_id,
                Number(installment),
            ]);
        }
        (0, paymentLogger_1.logWebhook)('paystack.webhook.processed', { reference });
        return res.status(200).json({ ok: true });
    }
    catch (err) {
        (0, paymentLogger_1.logWebhook)('paystack.webhook.error', { error: err.message });
        return res.status(200).json({ ok: true });
    }
};
exports.paystackWebhook = paystackWebhook;
