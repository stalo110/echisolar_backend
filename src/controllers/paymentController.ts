import { Request, Response } from 'express';
import { db } from '../config/db';
import { createPaymentDispatcher, createPaymentServices } from '../services/paymentFactory';
import { logPayment } from '../utils/paymentLogger';
import { TransactionGateway } from '../services/TransactionRepository';

const dispatcher = createPaymentDispatcher();
const { transactions, paystack, flutterwave } = createPaymentServices();

type AuthReq = Request & { user?: { userId: number; role: string; email?: string } };

export const initializePayment = async (req: AuthReq, res: Response) => {
  try {
    const { orderId, gateway, email, currency = 'NGN' } = req.body as {
      orderId: number;
      gateway: TransactionGateway;
      email?: string;
      currency?: string;
    };

    if (!orderId || !gateway) return res.status(400).json({ error: 'Missing orderId or gateway' });

    const [rows] = await db.query('SELECT id, userId, totalAmount FROM orders WHERE id = ? LIMIT 1', [orderId]);
    const order = (rows as any[])[0];
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (req.user?.userId && order.userId !== req.user.userId) return res.status(403).json({ error: 'Forbidden' });

    const userEmail = email || req.user?.email;
    if (!userEmail) return res.status(400).json({ error: 'Email is required' });

    const result = await dispatcher.initiate(
      { id: order.id, userId: order.userId, totalAmount: Number(order.totalAmount) },
      gateway,
      userEmail,
      currency
    );

    const reference = (result as any).reference;
    await db.query('INSERT INTO payments (orderId, provider, paymentIntentId, amount, currency, status) VALUES (?,?,?,?,?,?)', [
      orderId,
      gateway,
      reference,
      order.totalAmount,
      currency,
      'pending',
    ]);

    logPayment('initialize.endpoint.success', { orderId, gateway, reference });
    return res.json({ ok: true, data: result });
  } catch (err: any) {
    logPayment('initialize.endpoint.error', { error: err.message });
    return res.status(500).json({ error: err.message || 'Payment initialization failed' });
  }
};

export const verifyPayment = async (req: Request, res: Response) => {
  const reference = String(req.query.reference || '').trim();
  const gateway = String(req.query.gateway || '').trim() as TransactionGateway;

  if (!reference || !gateway) {
    return res.status(400).json({ error: 'Reference and gateway are required' });
  }

  try {
    const result = await dispatcher.verify(reference, gateway);
    const redirectBase = process.env.FRONTEND_URL || '/';
    if (result.success) {
      return res.redirect(`${redirectBase}/order/success?ref=${encodeURIComponent(reference)}`);
    }
    return res.redirect(`${redirectBase}/order/failed?ref=${encodeURIComponent(reference)}`);
  } catch (err: any) {
    logPayment('verify.endpoint.error', { reference, gateway, error: err.message });
    const redirectBase = process.env.FRONTEND_URL || '/';
    return res.redirect(`${redirectBase}/order/failed?ref=${encodeURIComponent(reference)}`);
  }
};

export const getTransactionByReference = async (req: AuthReq, res: Response) => {
  const reference = String(req.params.reference || '').trim();
  if (!reference) return res.status(400).json({ error: 'Missing reference' });

  try {
    const gateway = reference.startsWith('PAY-') ? 'paystack' : reference.startsWith('FLW-') ? 'flutterwave' : null;
    const record = await transactions.findByReference(reference);
    if (!record) return res.status(404).json({ error: 'Transaction not found' });

    let freshStatus: any = null;
    if (req.query.fresh === 'true' && gateway) {
      try {
        if (gateway === 'paystack') {
          const verify = await paystack.verify(reference);
          freshStatus = verify.data;
        } else if (gateway === 'flutterwave') {
          const verify = await flutterwave.verify(reference);
          freshStatus = verify.data;
        }
      } catch (err: any) {
        logPayment('admin.lookup.fresh.error', { reference, error: err.message });
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
  } catch (err: any) {
    logPayment('admin.lookup.error', { reference, error: err.message });
    return res.status(500).json({ error: 'Failed to fetch transaction' });
  }
};

export const getPaymentConfig = async (_req: Request, res: Response) => {
  const paystackPublicKey = process.env.PAYSTACK_PUBLIC_KEY || '';
  const flutterwavePublicKey = process.env.FLUTTERWAVE_PUBLIC_KEY || '';

  logPayment('config.fetch', { paystack: Boolean(paystackPublicKey), flutterwave: Boolean(flutterwavePublicKey) });

  return res.json({
    ok: true,
    data: {
      paystackPublicKey,
      flutterwavePublicKey,
    },
  });
};
