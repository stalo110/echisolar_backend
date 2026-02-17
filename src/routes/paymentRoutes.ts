import { Router } from 'express';
import { flutterwaveWebhook, paystackWebhook } from '../controllers/paymentWebhookController';
import { initializePayment, getTransactionByReference, getPaymentConfig } from '../controllers/paymentController';
import { protect, adminOnly } from '../middlewares/authMiddleware';
const r = Router();
// Flutterwave signatures also rely on the raw body captured in app.ts
r.post('/flutterwave/webhook', flutterwaveWebhook);
r.post('/paystack/webhook', paystackWebhook);
// Optional payment initialization for existing orders
r.post('/initialize', protect, initializePayment);
// Public config for frontend keys
r.get('/config', getPaymentConfig);
// Admin transaction lookup
r.get('/transaction/:reference', protect, adminOnly, getTransactionByReference);
export default r;
