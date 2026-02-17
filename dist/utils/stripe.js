"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.stripe = exports.createStripePaymentIntent = void 0;
const stripe_1 = __importDefault(require("stripe"));
const stripe = new stripe_1.default(process.env.STRIPE_SECRET_KEY, { apiVersion: '2022-11-15' });
exports.stripe = stripe;
async function createStripePaymentIntent({ amount, currency = 'usd', metadata = {} }) {
    const intent = await stripe.paymentIntents.create({
        amount,
        currency,
        metadata
    });
    return intent;
}
exports.createStripePaymentIntent = createStripePaymentIntent;
