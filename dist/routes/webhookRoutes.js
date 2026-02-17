"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const paymentWebhookController_1 = require("../controllers/paymentWebhookController");
const r = (0, express_1.Router)();
r.post('/paystack', paymentWebhookController_1.paystackWebhook);
r.post('/flutterwave', paymentWebhookController_1.flutterwaveWebhook);
exports.default = r;
