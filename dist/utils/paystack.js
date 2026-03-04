"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyPaystackTransaction = exports.initializePaystackTransaction = void 0;
const node_fetch_1 = __importDefault(require("node-fetch"));
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
const APP_URL = process.env.APP_URL || process.env.FRONTEND_URL || 'http://localhost:3000';
async function initializePaystackTransaction({ amount, email, metadata = {} }) {
    const res = await (0, node_fetch_1.default)('https://api.paystack.co/transaction/initialize', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${PAYSTACK_SECRET}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            email,
            amount: Math.round(amount * 100),
            callback_url: `${APP_URL}/verify-payment?gateway=paystack`,
            metadata
        })
    });
    const json = await res.json();
    if (!json.status)
        throw new Error(json.message || 'Paystack init failed');
    return json.data;
}
exports.initializePaystackTransaction = initializePaystackTransaction;
async function verifyPaystackTransaction(reference) {
    const res = await (0, node_fetch_1.default)(`https://api.paystack.co/transaction/verify/${reference}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` }
    });
    const json = await res.json();
    if (!json.status)
        throw new Error(json.message || 'Paystack verify failed');
    return json.data;
}
exports.verifyPaystackTransaction = verifyPaystackTransaction;
//# sourceMappingURL=paystack.js.map