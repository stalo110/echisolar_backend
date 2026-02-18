"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const paymentWebhookController_1 = require("../controllers/paymentWebhookController");
const paymentController_1 = require("../controllers/paymentController");
const authMiddleware_1 = require("../middlewares/authMiddleware");
const r = (0, express_1.Router)();
// Flutterwave signatures also rely on the raw body captured in app.ts
r.post('/flutterwave/webhook', paymentWebhookController_1.flutterwaveWebhook);
r.post('/paystack/webhook', paymentWebhookController_1.paystackWebhook);
// Optional payment initialization for existing orders
r.post('/initialize', authMiddleware_1.protect, paymentController_1.initializePayment);
// Public config for frontend keys
r.get('/config', paymentController_1.getPaymentConfig);
// Admin transaction lookup
r.get('/transaction/:reference', authMiddleware_1.protect, authMiddleware_1.adminOnly, paymentController_1.getTransactionByReference);
exports.default = r;
//# sourceMappingURL=paymentRoutes.js.map