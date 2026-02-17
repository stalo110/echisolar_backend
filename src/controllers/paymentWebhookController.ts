import { Request, Response } from 'express';
import { createPaymentServices } from '../services/paymentFactory';
import { logWebhook } from '../utils/paymentLogger';
import { db } from '../config/db';

const { transactions, paystack, flutterwave } = createPaymentServices();

export const flutterwaveWebhook = async (req: any, res: Response) => {
  const signature = req.headers['verif-hash'] as string | undefined;
  const payload = req.body;

  logWebhook('flutterwave.webhook.received', {
    headers: req.headers,
    payload,
  });

  if (!flutterwave.validateWebhookSignature(signature)) {
    logWebhook('flutterwave.webhook.invalid_signature', { signature_present: !!signature });
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
    if (!reference) return res.status(200).json({ ok: true });

    const existing = await transactions.findByReference(reference);
    if (!existing) return res.status(200).json({ ok: true });
    if (existing.status === 'success') return res.status(200).json({ ok: true });

    if (Number(data.amount) !== Number(existing.amount)) {
      logWebhook('flutterwave.webhook.amount_mismatch', {
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

    await db.query('UPDATE orders SET paymentStatus = ?, status = ? WHERE id = ?', [
      'paid',
      'processing',
      existing.order_id,
    ]);
    await db.query('UPDATE payments SET status = ? WHERE paymentIntentId = ?', ['success', reference]);
    const installment = data.meta?.installment || existing.metadata?.metadata?.installment;
    if (installment) {
      await db.query('UPDATE installments SET status = ?, paidAt = NOW() WHERE orderId = ? AND installmentNumber = ?', [
        'paid',
        existing.order_id,
        Number(installment),
      ]);
    }

    logWebhook('flutterwave.webhook.processed', { reference });
    return res.status(200).json({ ok: true });
  } catch (err: any) {
    logWebhook('flutterwave.webhook.error', { error: err.message });
    return res.status(200).json({ ok: true });
  }
};

export const paystackWebhook = async (req: Request, res: Response) => {
  const signature = req.headers['x-paystack-signature'] as string | undefined;
  const rawBody = (req as any).rawBody as string | undefined;
  const payload = req.body;

  logWebhook('paystack.webhook.received', {
    headers: req.headers,
    payload,
  });

  if (!paystack.validateWebhookSignature(rawBody, signature)) {
    logWebhook('paystack.webhook.invalid_signature', { signature_present: !!signature });
    return res.status(401).json({ ok: false, message: 'Invalid signature' });
  }

  try {
    if (payload?.event !== 'charge.success') {
      return res.status(200).json({ ok: true });
    }

    const data = payload?.data || {};
    const reference = data.reference;
    if (!reference) return res.status(200).json({ ok: true });

    const existing = await transactions.findByReference(reference);
    if (!existing) return res.status(200).json({ ok: true });
    if (existing.status === 'success') return res.status(200).json({ ok: true });

    const paidAmount = Number(data.amount) / 100;
    if (paidAmount !== Number(existing.amount)) {
      logWebhook('paystack.webhook.amount_mismatch', {
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

    await db.query('UPDATE orders SET paymentStatus = ?, status = ? WHERE id = ?', [
      'paid',
      'processing',
      existing.order_id,
    ]);
    await db.query('UPDATE payments SET status = ? WHERE paymentIntentId = ?', ['success', reference]);
    const installment = data.metadata?.installment || existing.metadata?.metadata?.installment;
    if (installment) {
      await db.query('UPDATE installments SET status = ?, paidAt = NOW() WHERE orderId = ? AND installmentNumber = ?', [
        'paid',
        existing.order_id,
        Number(installment),
      ]);
    }

    logWebhook('paystack.webhook.processed', { reference });
    return res.status(200).json({ ok: true });
  } catch (err: any) {
    logWebhook('paystack.webhook.error', { error: err.message });
    return res.status(200).json({ ok: true });
  }
};
