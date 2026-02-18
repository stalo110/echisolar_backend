import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import PaystackService from '../services/PaystackService';
import FlutterwaveService from '../services/FlutterwaveService';

class FakeRepo {
  records: any[] = [];
  async exists() {
    return false;
  }
  async create(input: any) {
    this.records.push(input);
    return 1;
  }
  async findByReference() {
    return null;
  }
  async updateStatus() {
    return;
  }
}

test('Paystack initialization uses correct payload', async () => {
  process.env.PAYSTACK_SECRET_KEY = 'sk_test_123';
  const repo = new FakeRepo();
  let capturedBody: any = null;

  const mockRequest = async (_url: string, options: any) => {
    capturedBody = JSON.parse(options.body);
    return {
      json: async () => ({
        status: true,
        data: { authorization_url: 'https://paystack.test/redirect' },
      }),
    } as any;
  };

  const service = new PaystackService(repo as any, mockRequest as any);
  const result = await service.initialize({ id: 42, userId: 7, totalAmount: 2500 }, 'test@example.com', 'NGN');

  assert.equal(result.authorization_url, 'https://paystack.test/redirect');
  assert.equal(capturedBody.email, 'test@example.com');
  assert.equal(capturedBody.amount, 2500 * 100);
  assert.ok(String(capturedBody.reference).startsWith('PAY-42-'));
});

test('Flutterwave initialization uses correct payload', async () => {
  process.env.FLUTTERWAVE_SECRET_KEY = 'flw_sk_test_123';
  process.env.FLUTTERWAVE_SECRET_HASH = 'flw_hash_123';
  const repo = new FakeRepo();
  let capturedBody: any = null;

  const mockRequest = async (_url: string, options: any) => {
    capturedBody = JSON.parse(options.body);
    return {
      json: async () => ({
        status: 'success',
        data: { link: 'https://flutterwave.test/redirect' },
      }),
    } as any;
  };

  const service = new FlutterwaveService(repo as any, mockRequest as any);
  const result = await service.initialize({ id: 77, userId: 9, totalAmount: 1500 }, 'test@example.com', 'NGN');

  assert.equal(result.link, 'https://flutterwave.test/redirect');
  assert.equal(capturedBody.customer.email, 'test@example.com');
  assert.equal(capturedBody.amount, '1500.00');
  assert.ok(String(capturedBody.tx_ref).startsWith('FLW-77-'));
});

test('Webhook signature validation works for Paystack and Flutterwave', async () => {
  process.env.PAYSTACK_SECRET_KEY = 'sk_test_abc';
  process.env.FLUTTERWAVE_SECRET_KEY = 'flw_sk_test_abc';
  process.env.FLUTTERWAVE_SECRET_HASH = 'hash_abc';

  const repo = new FakeRepo();
  const paystack = new PaystackService(repo as any);
  const flutterwave = new FlutterwaveService(repo as any);

  const rawBody = JSON.stringify({ event: 'charge.success', data: { reference: 'PAY-1-1' } });
  const signature = crypto.createHmac('sha512', process.env.PAYSTACK_SECRET_KEY!).update(rawBody).digest('hex');
  const flutterwaveHmac = crypto
    .createHmac('sha256', process.env.FLUTTERWAVE_SECRET_KEY!)
    .update(rawBody)
    .digest('hex');

  assert.equal(paystack.validateWebhookSignature(rawBody, signature), true);
  assert.equal(paystack.validateWebhookSignature(rawBody, 'bad'), false);
  assert.equal(flutterwave.validateWebhookSignature(rawBody, 'hash_abc', undefined), true);
  assert.equal(flutterwave.validateWebhookSignature(rawBody, undefined, flutterwaveHmac), true);
  assert.equal(flutterwave.validateWebhookSignature(rawBody, 'bad', undefined), false);
  assert.equal(flutterwave.validateWebhookSignature(rawBody, undefined, 'bad'), false);
});
