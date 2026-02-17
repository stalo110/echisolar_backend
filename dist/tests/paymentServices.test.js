"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const node_crypto_1 = __importDefault(require("node:crypto"));
const PaystackService_1 = __importDefault(require("../services/PaystackService"));
const FlutterwaveService_1 = __importDefault(require("../services/FlutterwaveService"));
class FakeRepo {
    constructor() {
        this.records = [];
    }
    async exists() {
        return false;
    }
    async create(input) {
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
(0, node_test_1.default)('Paystack initialization uses correct payload', async () => {
    process.env.PAYSTACK_SECRET_KEY = 'sk_test_123';
    const repo = new FakeRepo();
    let capturedBody = null;
    const mockRequest = async (_url, options) => {
        capturedBody = JSON.parse(options.body);
        return {
            json: async () => ({
                status: true,
                data: { authorization_url: 'https://paystack.test/redirect' },
            }),
        };
    };
    const service = new PaystackService_1.default(repo, mockRequest);
    const result = await service.initialize({ id: 42, userId: 7, totalAmount: 2500 }, 'test@example.com', 'NGN');
    strict_1.default.equal(result.authorization_url, 'https://paystack.test/redirect');
    strict_1.default.equal(capturedBody.email, 'test@example.com');
    strict_1.default.equal(capturedBody.amount, 2500 * 100);
    strict_1.default.ok(String(capturedBody.reference).startsWith('PAY-42-'));
});
(0, node_test_1.default)('Flutterwave initialization uses correct payload', async () => {
    process.env.FLUTTERWAVE_SECRET_KEY = 'flw_sk_test_123';
    process.env.FLUTTERWAVE_SECRET_HASH = 'flw_hash_123';
    const repo = new FakeRepo();
    let capturedBody = null;
    const mockRequest = async (_url, options) => {
        capturedBody = JSON.parse(options.body);
        return {
            json: async () => ({
                status: 'success',
                data: { link: 'https://flutterwave.test/redirect' },
            }),
        };
    };
    const service = new FlutterwaveService_1.default(repo, mockRequest);
    const result = await service.initialize({ id: 77, userId: 9, totalAmount: 1500 }, 'test@example.com', 'NGN');
    strict_1.default.equal(result.link, 'https://flutterwave.test/redirect');
    strict_1.default.equal(capturedBody.customer.email, 'test@example.com');
    strict_1.default.equal(capturedBody.amount, '1500.00');
    strict_1.default.ok(String(capturedBody.tx_ref).startsWith('FLW-77-'));
});
(0, node_test_1.default)('Webhook signature validation works for Paystack and Flutterwave', async () => {
    process.env.PAYSTACK_SECRET_KEY = 'sk_test_abc';
    process.env.FLUTTERWAVE_SECRET_HASH = 'hash_abc';
    const repo = new FakeRepo();
    const paystack = new PaystackService_1.default(repo);
    const flutterwave = new FlutterwaveService_1.default(repo);
    const rawBody = JSON.stringify({ event: 'charge.success', data: { reference: 'PAY-1-1' } });
    const signature = node_crypto_1.default.createHmac('sha512', process.env.PAYSTACK_SECRET_KEY).update(rawBody).digest('hex');
    strict_1.default.equal(paystack.validateWebhookSignature(rawBody, signature), true);
    strict_1.default.equal(paystack.validateWebhookSignature(rawBody, 'bad'), false);
    strict_1.default.equal(flutterwave.validateWebhookSignature('hash_abc'), true);
    strict_1.default.equal(flutterwave.validateWebhookSignature('bad'), false);
});
