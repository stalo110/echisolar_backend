"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyFlutterwaveSignature = exports.verifyFlutterwaveTransaction = exports.initializeFlutterwaveTransaction = void 0;
const node_fetch_1 = __importDefault(require("node-fetch"));
const FLUTTERWAVE_SECRET_KEY = process.env.FLUTTERWAVE_SECRET_KEY;
const FLUTTERWAVE_ENCRYPTION_KEY = process.env.FLUTTERWAVE_ENCRYPTION_KEY;
const FLUTTERWAVE_SECRET_HASH = process.env.FLUTTERWAVE_SECRET_HASH || process.env.FLUTTERWAVE_WEBHOOK_HASH;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
if (!FLUTTERWAVE_SECRET_KEY || !FLUTTERWAVE_ENCRYPTION_KEY || !FLUTTERWAVE_SECRET_HASH) {
    throw new Error('Missing Flutterwave configuration in environment variables');
}
async function initializeFlutterwaveTransaction({ amount, email, metadata = {}, currency = 'NGN', redirectPath = '/flutterwave/callback', paymentOptions = 'card,ussd', title = 'EchiSolar payment', description = 'Order checkout', txRef, }) {
    const numericAmount = Number(amount);
    if (Number.isNaN(numericAmount) || numericAmount <= 0) {
        throw new Error('Invalid amount for Flutterwave');
    }
    const tx_ref = txRef || `echisolar-${metadata.orderId ?? 'order'}-${Date.now()}`;
    const response = await (0, node_fetch_1.default)('https://api.flutterwave.com/v3/payments', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${FLUTTERWAVE_SECRET_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            tx_ref,
            amount: numericAmount,
            currency: currency.toUpperCase(),
            redirect_url: `${FRONTEND_URL}${redirectPath}`,
            payment_options: paymentOptions,
            customer: { email },
            meta: metadata,
            customizations: { title, description },
        }),
    });
    const json = await response.json();
    if (json.status !== 'success') {
        throw new Error(json.message || 'Flutterwave initialization failed');
    }
    return {
        ...json.data,
        tx_ref,
    };
}
exports.initializeFlutterwaveTransaction = initializeFlutterwaveTransaction;
async function verifyFlutterwaveTransaction(transactionId) {
    const response = await (0, node_fetch_1.default)(`https://api.flutterwave.com/v3/transactions/${transactionId}/verify`, {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${FLUTTERWAVE_SECRET_KEY}`,
        },
    });
    const json = await response.json();
    if (json.status !== 'success') {
        throw new Error(json.message || 'Flutterwave verification failed');
    }
    return json.data;
}
exports.verifyFlutterwaveTransaction = verifyFlutterwaveTransaction;
function verifyFlutterwaveSignature(_rawBody, signature) {
    if (!signature)
        return false;
    return signature === FLUTTERWAVE_SECRET_HASH;
}
exports.verifyFlutterwaveSignature = verifyFlutterwaveSignature;
//# sourceMappingURL=flutterwave.js.map