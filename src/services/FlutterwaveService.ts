import { fetchWithTimeout } from '../utils/http';
import TransactionRepository, { TransactionGateway } from './TransactionRepository';
import { db } from '../config/db';
import { logPayment } from '../utils/paymentLogger';

export type OrderLike = { id: number; userId: number; totalAmount: number };

class FlutterwaveService {
  private baseUrl = 'https://api.flutterwave.com/v3';
  private secretKey = process.env.FLUTTERWAVE_SECRET_KEY || '';
  private secretHash = process.env.FLUTTERWAVE_SECRET_HASH || '';

  constructor(private transactions: TransactionRepository, private request = fetchWithTimeout) {}

  async initialize(order: OrderLike, email: string, currency: string, metadata: Record<string, any> = {}) {
    if (!this.secretKey) throw new Error('Missing Flutterwave secret key');

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

  validateWebhookSignature(signature: string | undefined) {
    if (!signature || !this.secretHash) return false;
    return signature === this.secretHash;
  }

  getGateway(): TransactionGateway {
    return 'flutterwave';
  }
}

export default FlutterwaveService;
