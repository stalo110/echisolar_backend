import crypto from 'crypto';
import { fetchWithTimeout } from '../utils/http';
import TransactionRepository, { TransactionGateway } from './TransactionRepository';
import { db } from '../config/db';
import { logPayment } from '../utils/paymentLogger';

export type OrderLike = { id: number; userId: number; totalAmount: number };
export type FlutterwaveInitializeOptions = { paymentPlanId?: string };
export type CreateFlutterwavePlanInput = {
  name: string;
  amount: number;
  interval: 'daily' | 'weekly' | 'monthly' | 'yearly';
  currency?: string;
  duration?: number;
};

class FlutterwaveService {
  private baseUrl = 'https://api.flutterwave.com/v3';
  private secretKey = process.env.FLUTTERWAVE_SECRET_KEY || '';
  private secretHash = process.env.FLUTTERWAVE_SECRET_HASH || process.env.FLUTTERWAVE_WEBHOOK_HASH || '';

  constructor(private transactions: TransactionRepository, private request = fetchWithTimeout) {}

  async initialize(
    order: OrderLike,
    email: string,
    currency: string,
    metadata: Record<string, any> = {},
    options: FlutterwaveInitializeOptions = {}
  ) {
    if (!this.secretKey) throw new Error('Missing Flutterwave secret key');

    let reference = `FLW-${order.id}-${Date.now()}`;
    while (await this.transactions.exists(reference)) {
      reference = `${reference}-${Date.now()}`;
    }

    const payload = {
      tx_ref: reference,
      amount: Number(order.totalAmount),
      currency: String(currency || 'NGN').toUpperCase(),
      redirect_url: `${process.env.APP_URL || process.env.FRONTEND_URL || ''}/verify-payment?gateway=flutterwave`,
      customer: { email },
      meta: { order_id: order.id, ...metadata },
      ...(options.paymentPlanId ? { payment_plan: options.paymentPlanId } : {}),
    };

    logPayment('flutterwave.initialize.request', { orderId: order.id, reference, payload });

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
        logPayment('flutterwave.initialize.failed', { reference, response: json });
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

      logPayment('flutterwave.initialize.success', { reference, link: json.data?.link });

      return {
        link: json.data?.link,
        reference,
      };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        logPayment('flutterwave.initialize.timeout', { reference });
        throw new Error('Payment gateway timeout. Please try again.');
      }
      logPayment('flutterwave.initialize.error', { reference, error: err.message });
      throw err;
    }
  }

  async createPaymentPlan(input: CreateFlutterwavePlanInput) {
    if (!this.secretKey) throw new Error('Missing Flutterwave secret key');

    const payload = {
      name: input.name,
      amount: Number(input.amount),
      interval: input.interval,
      currency: String(input.currency || 'NGN').toUpperCase(),
      ...(input.duration ? { duration: input.duration } : {}),
    };

    logPayment('flutterwave.plan.create.request', { payload });

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
      logPayment('flutterwave.plan.create.failed', { response: json });
      throw new Error(json.message || 'Unable to create Flutterwave payment plan');
    }

    logPayment('flutterwave.plan.create.success', { id: json.data.id });

    return {
      id: String(json.data.id),
      raw: json.data,
    };
  }

  async verify(reference: string) {
    if (!this.secretKey) throw new Error('Missing Flutterwave secret key');

    logPayment('flutterwave.verify.request', { reference });

    try {
      const res = await this.request(`${this.baseUrl}/transactions/${reference}/verify`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${this.secretKey}` },
      });
      const json = await res.json();
      if (json.status !== 'success') {
        logPayment('flutterwave.verify.failed', { reference, response: json });
        throw new Error(json.message || 'Flutterwave verification failed');
      }

      const transaction = await this.transactions.findByReference(reference);
      if (!transaction) throw new Error(`Transaction not found: ${reference}`);

      const isSuccessful = json.data?.status === 'successful';
      const paidAmount = Number(json.data?.amount || 0);

      if (isSuccessful && paidAmount !== Number(transaction.amount)) {
        logPayment('flutterwave.verify.amount_mismatch', {
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
        await db.query('UPDATE orders SET paymentStatus = ?, status = ? WHERE id = ?', ['paid', 'processing', transaction.order_id]);
        await db.query('UPDATE payments SET status = ? WHERE paymentIntentId = ?', ['success', reference]);
      }

      logPayment('flutterwave.verify.success', { reference, isSuccessful });
      return { success: isSuccessful, data: json.data };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        logPayment('flutterwave.verify.timeout', { reference });
        throw new Error('Payment gateway timeout. Please try again.');
      }
      logPayment('flutterwave.verify.error', { reference, error: err.message });
      throw err;
    }
  }

  private constantTimeEquals(a: string, b: string) {
    const left = Buffer.from(a, 'utf8');
    const right = Buffer.from(b, 'utf8');
    if (left.length !== right.length) return false;
    return crypto.timingSafeEqual(left, right);
  }

  validateWebhookSignature(
    rawBody: string | undefined,
    legacySignature: string | undefined,
    hmacSignature: string | undefined
  ) {
    const legacy = String(legacySignature || '').trim();
    const hmac = String(hmacSignature || '').trim();

    const legacyValid =
      !!legacy && !!this.secretHash && this.constantTimeEquals(legacy, String(this.secretHash).trim());

    let hmacValid = false;
    if (rawBody && hmac && this.secretKey) {
      const expected = crypto.createHmac('sha256', this.secretKey).update(rawBody).digest('hex');
      hmacValid = this.constantTimeEquals(hmac.toLowerCase(), expected.toLowerCase());
    }

    return legacyValid || hmacValid;
  }

  getGateway(): TransactionGateway {
    return 'flutterwave';
  }
}

export default FlutterwaveService;
