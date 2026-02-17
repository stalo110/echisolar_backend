import { Router } from 'express';
import { flutterwaveWebhook, paystackWebhook } from '../controllers/paymentWebhookController';

const r = Router();

r.post('/paystack', paystackWebhook);
r.post('/flutterwave', flutterwaveWebhook);

export default r;
