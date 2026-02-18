import crypto from 'crypto';
import { fetchWithTimeout } from '../utils/http';
import TransactionRepository, { TransactionGateway } from './TransactionRepository';
import { db } from '../config/db';
import { logPayment } from '../utils/paymentLogger';

export type OrderLike = { id: number; userId: number; totalAmount: number };
export type PaystackInitializeOptions = { planCode?: string };
export type CreatePaystackPlanInput = {
  name: string;
  amount: number;
  interval: 'daily' | 'weekly' | 'monthly' | 'annually';
  currency?: string;
  invoiceLimit?: number;
};

class PaystackService {
  private baseUrl = 'https://api.paystack.co';
  private secretKey = process.env.PAYSTACK_SECRET_KEY || '';

  constructor(private transactions: TransactionRepository, private request = fetchWithTimeout) {}

  async initialize(
    order: OrderLike,
    email: string,
    currency: string,
    metadata: Record<string, any> = {},
    options: PaystackInitializeOptions = {}
  ) {
    if (!this.secretKey) throw new Error('Missing Paystack secret key');

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

    logPayment('paystack.initialize.request', { orderId: order.id, reference, payload });

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
        logPayment('paystack.initialize.failed', { reference, response: json });
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

      logPayment('paystack.initialize.success', {
        reference,
        authorization_url: json.data?.authorization_url,
      });

      return {
        authorization_url: json.data?.authorization_url,
        reference,
      };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        logPayment('paystack.initialize.timeout', { reference });
        throw new Error('Payment gateway timeout. Please try again.');
      }
      logPayment('paystack.initialize.error', { reference, error: err.message });
      throw err;
    }
  }

  async createPlan(input: CreatePaystackPlanInput) {
    if (!this.secretKey) throw new Error('Missing Paystack secret key');

    const payload = {
      name: input.name,
      amount: Math.round(Number(input.amount) * 100),
      interval: input.interval,
      currency: String(input.currency || 'NGN').toUpperCase(),
      ...(input.invoiceLimit ? { invoice_limit: input.invoiceLimit } : {}),
    };

    logPayment('paystack.plan.create.request', { payload });

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
      logPayment('paystack.plan.create.failed', { response: json });
      throw new Error(json.message || 'Unable to create Paystack plan');
    }

    logPayment('paystack.plan.create.success', {
      plan_code: json.data.plan_code,
      id: json.data.id,
    });

    return {
      planCode: json.data.plan_code as string,
      id: Number(json.data.id),
      raw: json.data,
    };
  }

  async verify(reference: string) {
    if (!this.secretKey) throw new Error('Missing Paystack secret key');

    logPayment('paystack.verify.request', { reference });

    try {
      const res = await this.request(`${this.baseUrl}/transaction/verify/${reference}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${this.secretKey}` },
      });
      const json = await res.json();
      if (!json.status) {
        logPayment('paystack.verify.failed', { reference, response: json });
        throw new Error(json.message || 'Paystack verification failed');
      }

      const transaction = await this.transactions.findByReference(reference);
      if (!transaction) throw new Error(`Transaction not found: ${reference}`);

      const isSuccessful = json.data?.status === 'success';
      const paidAmount = Number(json.data?.amount || 0) / 100;

      if (isSuccessful && paidAmount !== Number(transaction.amount)) {
        logPayment('paystack.verify.amount_mismatch', {
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

      logPayment('paystack.verify.success', { reference, isSuccessful });
      return { success: isSuccessful, data: json.data };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        logPayment('paystack.verify.timeout', { reference });
        throw new Error('Payment gateway timeout. Please try again.');
      }
      logPayment('paystack.verify.error', { reference, error: err.message });
      throw err;
    }
  }

  validateWebhookSignature(rawBody: string | undefined, signature: string | undefined) {
    if (!rawBody || !signature) return false;
    const hash = crypto.createHmac('sha512', this.secretKey).update(rawBody).digest('hex');
    return hash === signature;
  }

  getGateway(): TransactionGateway {
    return 'paystack';
  }
}

export default PaystackService;
