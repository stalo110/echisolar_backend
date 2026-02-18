import { Request, Response } from 'express';
import { createPaymentServices } from '../services/paymentFactory';
import { logWebhook } from '../utils/paymentLogger';
import { db } from '../config/db';

const { transactions, paystack, flutterwave } = createPaymentServices();

const updateOrderPaymentState = async (orderId: number) => {
  const [rows] = await db.query(
    `SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) AS paidCount
     FROM installments
     WHERE orderId = ?`,
    [orderId]
  );
  const aggregate = (rows as any[])[0];
  const total = Number(aggregate?.total || 0);
  const paidCount = Number(aggregate?.paidCount || 0);

  if (total === 0) {
    await db.query('UPDATE orders SET paymentStatus = ?, status = ? WHERE id = ?', [
      'paid',
      'processing',
      orderId,
    ]);
    return;
  }

  const paymentStatus = paidCount >= total ? 'paid' : paidCount > 0 ? 'partial' : 'pending';
  await db.query('UPDATE orders SET paymentStatus = ?, status = ? WHERE id = ?', [
    paymentStatus,
    'processing',
    orderId,
  ]);
};

const markInstallmentPaid = async (orderId: number, installmentNumber?: number) => {
  if (installmentNumber) {
    await db.query(
      'UPDATE installments SET status = ?, paidAt = NOW() WHERE orderId = ? AND installmentNumber = ?',
      ['paid', orderId, installmentNumber]
    );
    return installmentNumber;
  }

  const [pendingRows] = await db.query(
    'SELECT installmentNumber FROM installments WHERE orderId = ? AND status = ? ORDER BY installmentNumber ASC LIMIT 1',
    [orderId, 'pending']
  );
  const pending = (pendingRows as any[])[0];
  if (!pending) return null;

  await db.query(
    'UPDATE installments SET status = ?, paidAt = NOW() WHERE orderId = ? AND installmentNumber = ?',
    ['paid', orderId, Number(pending.installmentNumber)]
  );
  return Number(pending.installmentNumber);
};

const upsertPaymentByReference = async (params: {
  orderId: number;
  provider: 'paystack' | 'flutterwave';
  reference: string;
  amount: number;
  currency: string;
}) => {
  const [rows] = await db.query('SELECT id FROM payments WHERE paymentIntentId = ? LIMIT 1', [
    params.reference,
  ]);
  const existing = (rows as any[])[0];
  if (existing) {
    await db.query('UPDATE payments SET status = ? WHERE id = ?', ['success', existing.id]);
    return;
  }

  await db.query(
    'INSERT INTO payments (orderId, provider, paymentIntentId, amount, currency, status) VALUES (?,?,?,?,?,?)',
    [
      params.orderId,
      params.provider,
      params.reference,
      params.amount,
      params.currency,
      'success',
    ]
  );
};

type GatewaySubscriptionInfo = {
  orderId?: number;
  installment?: number;
  amount: number;
  currency: string;
  planReference?: string;
  subscriptionReference?: string;
  customerEmail?: string;
  customerReference?: string;
};

const asString = (value: unknown) => {
  const text = String(value ?? '').trim();
  return text.length ? text : undefined;
};

const asPositiveNumber = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return parsed;
};

const getPaystackInfo = (data: any): GatewaySubscriptionInfo => ({
  orderId: asPositiveNumber(data?.metadata?.order_id),
  installment: asPositiveNumber(data?.metadata?.installment),
  amount: Number(data?.amount || 0) / 100,
  currency: String(data?.currency || 'NGN').toUpperCase(),
  planReference: asString(
    data?.plan?.plan_code ||
      data?.plan_code ||
      data?.metadata?.subscription_plan_code ||
      data?.metadata?.subscription_plan_id ||
      data?.plan?.id
  ),
  subscriptionReference: asString(
    data?.subscription?.subscription_code || data?.subscription_code || data?.metadata?.subscription_code
  ),
  customerEmail: asString(data?.customer?.email || data?.metadata?.customer_email),
  customerReference: asString(data?.customer?.customer_code || data?.customer?.id),
});

const getFlutterwaveInfo = (data: any): GatewaySubscriptionInfo => ({
  orderId: asPositiveNumber(data?.meta?.order_id),
  installment: asPositiveNumber(data?.meta?.installment),
  amount: Number(data?.amount || 0),
  currency: String(data?.currency || 'NGN').toUpperCase(),
  planReference: asString(
    data?.payment_plan ||
      data?.payment_plan_id ||
      data?.meta?.subscription_plan_id ||
      data?.meta?.subscription_plan_code
  ),
  subscriptionReference: asString(data?.subscription_id || data?.meta?.subscription_id || data?.subscription?.id),
  customerEmail: asString(data?.customer?.email || data?.meta?.customer_email),
  customerReference: asString(data?.customer?.id || data?.customer?.customer_code || data?.customer?.customer_id),
});

const upsertGatewaySubscriptionMapping = async (params: {
  provider: 'paystack' | 'flutterwave';
  orderId?: number;
  userId?: number;
  planReference?: string;
  subscriptionReference?: string;
  customerEmail?: string;
  customerReference?: string;
  status?: 'active' | 'inactive' | 'cancelled' | 'failed';
  metadata?: Record<string, any>;
}) => {
  const planReference = asString(params.planReference);
  const subscriptionReference = asString(params.subscriptionReference);
  if (!planReference && !subscriptionReference) return;

  let row: any | null = null;

  if (subscriptionReference) {
    const [rows] = await db.query(
      'SELECT id FROM gatewaySubscriptions WHERE provider = ? AND subscriptionReference = ? LIMIT 1',
      [params.provider, subscriptionReference]
    );
    row = (rows as any[])[0] || null;
  }

  if (!row && planReference && params.orderId) {
    const [rows] = await db.query(
      'SELECT id FROM gatewaySubscriptions WHERE provider = ? AND orderId = ? AND planReference = ? LIMIT 1',
      [params.provider, params.orderId, planReference]
    );
    row = (rows as any[])[0] || null;
  }

  if (!row && planReference && params.customerEmail) {
    const [rows] = await db.query(
      'SELECT id FROM gatewaySubscriptions WHERE provider = ? AND planReference = ? AND customerEmail = ? ORDER BY id DESC LIMIT 1',
      [params.provider, planReference, params.customerEmail]
    );
    row = (rows as any[])[0] || null;
  }

  const metadataJson = params.metadata ? JSON.stringify(params.metadata) : null;

  if (row) {
    await db.query(
      `UPDATE gatewaySubscriptions
       SET
         orderId = COALESCE(?, orderId),
         userId = COALESCE(?, userId),
         planReference = COALESCE(?, planReference),
         subscriptionReference = COALESCE(?, subscriptionReference),
         customerEmail = COALESCE(?, customerEmail),
         customerReference = COALESCE(?, customerReference),
         status = ?,
         metadata = COALESCE(?, metadata)
       WHERE id = ?`,
      [
        params.orderId ?? null,
        params.userId ?? null,
        planReference ?? null,
        subscriptionReference ?? null,
        params.customerEmail ?? null,
        params.customerReference ?? null,
        params.status || 'active',
        metadataJson,
        row.id,
      ]
    );
    return;
  }

  if (!params.orderId || !params.userId) return;

  await db.query(
    `INSERT INTO gatewaySubscriptions
      (orderId, userId, provider, planReference, subscriptionReference, customerEmail, customerReference, status, metadata)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [
      params.orderId,
      params.userId,
      params.provider,
      planReference ?? null,
      subscriptionReference ?? null,
      params.customerEmail ?? null,
      params.customerReference ?? null,
      params.status || 'active',
      metadataJson,
    ]
  );
};

const resolveMappedOrder = async (provider: 'paystack' | 'flutterwave', info: GatewaySubscriptionInfo) => {
  if (info.subscriptionReference) {
    const [rows] = await db.query(
      `SELECT orderId, userId
       FROM gatewaySubscriptions
       WHERE provider = ? AND subscriptionReference = ?
       ORDER BY id DESC LIMIT 1`,
      [provider, info.subscriptionReference]
    );
    const row = (rows as any[])[0];
    if (row) return { orderId: Number(row.orderId), userId: Number(row.userId) };
  }

  if (info.planReference && info.customerEmail) {
    const [rows] = await db.query(
      `SELECT orderId, userId
       FROM gatewaySubscriptions
       WHERE provider = ? AND planReference = ? AND customerEmail = ?
       ORDER BY id DESC LIMIT 1`,
      [provider, info.planReference, info.customerEmail]
    );
    const row = (rows as any[])[0];
    if (row) return { orderId: Number(row.orderId), userId: Number(row.userId) };
  }

  if (info.planReference) {
    const [rows] = await db.query(
      `SELECT orderId, userId
       FROM gatewaySubscriptions
       WHERE provider = ? AND planReference = ?
       ORDER BY id DESC LIMIT 1`,
      [provider, info.planReference]
    );
    const row = (rows as any[])[0];
    if (row) return { orderId: Number(row.orderId), userId: Number(row.userId) };
  }

  if (info.customerEmail) {
    const [rows] = await db.query(
      `SELECT gs.orderId, gs.userId
       FROM gatewaySubscriptions gs
       JOIN installments i ON i.orderId = gs.orderId AND i.status = 'pending'
       WHERE gs.provider = ? AND gs.customerEmail = ?
       ORDER BY gs.id DESC LIMIT 1`,
      [provider, info.customerEmail]
    );
    const row = (rows as any[])[0];
    if (row) return { orderId: Number(row.orderId), userId: Number(row.userId) };
  }

  return null;
};

export const flutterwaveWebhook = async (req: any, res: Response) => {
  const legacySignature = req.headers['verif-hash'] as string | undefined;
  const hmacSignature = req.headers['flutterwave-signature'] as string | undefined;
  const rawBody = (req as any).rawBody as string | undefined;
  const payload = req.body;

  logWebhook('flutterwave.webhook.received', {
    headers: req.headers,
    payload,
  });

  if (!flutterwave.validateWebhookSignature(rawBody, legacySignature, hmacSignature)) {
    logWebhook('flutterwave.webhook.invalid_signature', {
      legacy_signature_present: !!legacySignature,
      hmac_signature_present: !!hmacSignature,
    });
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
    const info = getFlutterwaveInfo(data);

    if (existing) {
      if (existing.status === 'success') return res.status(200).json({ ok: true });

      if (info.amount !== Number(existing.amount)) {
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

      await upsertPaymentByReference({
        orderId: existing.order_id,
        provider: 'flutterwave',
        reference,
        amount: info.amount,
        currency: info.currency,
      });

      await markInstallmentPaid(
        existing.order_id,
        Number(info.installment || existing.metadata?.metadata?.installment || 0) || undefined
      );
      await updateOrderPaymentState(existing.order_id);
      await upsertGatewaySubscriptionMapping({
        provider: 'flutterwave',
        orderId: existing.order_id,
        userId: existing.user_id,
        planReference: info.planReference,
        subscriptionReference: info.subscriptionReference,
        customerEmail: info.customerEmail,
        customerReference: info.customerReference,
        metadata: { source: 'known_transaction', webhook_payload: data },
      });
      logWebhook('flutterwave.webhook.processed', { reference, source: 'known_transaction' });
      return res.status(200).json({ ok: true });
    }

    const mapped = await resolveMappedOrder('flutterwave', info);
    const candidateOrderId = info.orderId || mapped?.orderId;
    if (!candidateOrderId) return res.status(200).json({ ok: true });

    const [orderRows] = await db.query('SELECT id, userId FROM orders WHERE id = ? LIMIT 1', [candidateOrderId]);
    const order = (orderRows as any[])[0];
    if (!order) return res.status(200).json({ ok: true });

    const [pendingRows] = await db.query(
      'SELECT installmentNumber, amount FROM installments WHERE orderId = ? AND status = ? ORDER BY installmentNumber ASC LIMIT 1',
      [order.id, 'pending']
    );
    const pending = (pendingRows as any[])[0];
    if (!pending) return res.status(200).json({ ok: true });
    if (Number(pending.amount) !== info.amount) {
      logWebhook('flutterwave.webhook.pending_installment_amount_mismatch', {
        reference,
        orderId: order.id,
        expected: pending.amount,
        received: info.amount,
      });
      return res.status(200).json({ ok: true });
    }

    if (!(await transactions.exists(reference))) {
      await transactions.create({
        order_id: Number(order.id),
        user_id: Number(order.userId),
        reference,
        gateway: 'flutterwave',
        amount: info.amount,
        currency: info.currency,
        status: 'success',
        metadata: {
          source: 'subscription_webhook',
          installment: Number(pending.installmentNumber),
          plan_reference: info.planReference || null,
          subscription_reference: info.subscriptionReference || null,
          customer_email: info.customerEmail || null,
          customer_reference: info.customerReference || null,
          webhook_payload: data,
        },
      });
    }

    await upsertPaymentByReference({
      orderId: Number(order.id),
      provider: 'flutterwave',
      reference,
      amount: info.amount,
      currency: info.currency,
    });
    await markInstallmentPaid(Number(order.id), Number(pending.installmentNumber));
    await updateOrderPaymentState(Number(order.id));
    await upsertGatewaySubscriptionMapping({
      provider: 'flutterwave',
      orderId: Number(order.id),
      userId: Number(order.userId),
      planReference: info.planReference,
      subscriptionReference: info.subscriptionReference,
      customerEmail: info.customerEmail,
      customerReference: info.customerReference,
      metadata: {
        source: 'subscription_fallback',
        webhook_payload: data,
      },
    });

    logWebhook('flutterwave.webhook.processed', { reference, source: 'subscription_fallback' });
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
    const info = getPaystackInfo(data);

    if (existing) {
      if (existing.status === 'success') return res.status(200).json({ ok: true });

      if (info.amount !== Number(existing.amount)) {
        logWebhook('paystack.webhook.amount_mismatch', {
          reference,
          expected: existing.amount,
          received: info.amount,
        });
        return res.status(200).json({ ok: true });
      }

      await transactions.updateStatus(reference, 'success', {
        ...existing.metadata,
        webhook_payload: data,
      });

      await upsertPaymentByReference({
        orderId: existing.order_id,
        provider: 'paystack',
        reference,
        amount: info.amount,
        currency: info.currency,
      });

      await markInstallmentPaid(
        existing.order_id,
        Number(info.installment || existing.metadata?.metadata?.installment || 0) || undefined
      );
      await updateOrderPaymentState(existing.order_id);
      await upsertGatewaySubscriptionMapping({
        provider: 'paystack',
        orderId: existing.order_id,
        userId: existing.user_id,
        planReference: info.planReference,
        subscriptionReference: info.subscriptionReference,
        customerEmail: info.customerEmail,
        customerReference: info.customerReference,
        metadata: { source: 'known_transaction', webhook_payload: data },
      });
      logWebhook('paystack.webhook.processed', { reference, source: 'known_transaction' });
      return res.status(200).json({ ok: true });
    }

    const mapped = await resolveMappedOrder('paystack', info);
    const candidateOrderId = info.orderId || mapped?.orderId;
    if (!candidateOrderId) return res.status(200).json({ ok: true });

    const [orderRows] = await db.query('SELECT id, userId FROM orders WHERE id = ? LIMIT 1', [candidateOrderId]);
    const order = (orderRows as any[])[0];
    if (!order) return res.status(200).json({ ok: true });

    const [pendingRows] = await db.query(
      'SELECT installmentNumber, amount FROM installments WHERE orderId = ? AND status = ? ORDER BY installmentNumber ASC LIMIT 1',
      [order.id, 'pending']
    );
    const pending = (pendingRows as any[])[0];
    if (!pending) return res.status(200).json({ ok: true });
    if (Number(pending.amount) !== info.amount) {
      logWebhook('paystack.webhook.pending_installment_amount_mismatch', {
        reference,
        orderId: order.id,
        expected: pending.amount,
        received: info.amount,
      });
      return res.status(200).json({ ok: true });
    }

    if (!(await transactions.exists(reference))) {
      await transactions.create({
        order_id: Number(order.id),
        user_id: Number(order.userId),
        reference,
        gateway: 'paystack',
        amount: info.amount,
        currency: info.currency,
        status: 'success',
        metadata: {
          source: 'subscription_webhook',
          installment: Number(pending.installmentNumber),
          plan_reference: info.planReference || null,
          subscription_reference: info.subscriptionReference || null,
          customer_email: info.customerEmail || null,
          customer_reference: info.customerReference || null,
          webhook_payload: data,
        },
      });
    }

    await upsertPaymentByReference({
      orderId: Number(order.id),
      provider: 'paystack',
      reference,
      amount: info.amount,
      currency: info.currency,
    });
    await markInstallmentPaid(Number(order.id), Number(pending.installmentNumber));
    await updateOrderPaymentState(Number(order.id));
    await upsertGatewaySubscriptionMapping({
      provider: 'paystack',
      orderId: Number(order.id),
      userId: Number(order.userId),
      planReference: info.planReference,
      subscriptionReference: info.subscriptionReference,
      customerEmail: info.customerEmail,
      customerReference: info.customerReference,
      metadata: {
        source: 'subscription_fallback',
        webhook_payload: data,
      },
    });

    logWebhook('paystack.webhook.processed', { reference, source: 'subscription_fallback' });
    return res.status(200).json({ ok: true });
  } catch (err: any) {
    logWebhook('paystack.webhook.error', { error: err.message });
    return res.status(200).json({ ok: true });
  }
};
