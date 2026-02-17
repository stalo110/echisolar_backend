"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const paymentLogger_1 = require("../utils/paymentLogger");
class PaymentDispatcher {
    constructor(paystackService, flutterwaveService) {
        this.paystackService = paystackService;
        this.flutterwaveService = flutterwaveService;
    }
    async initiate(order, gateway, email, currency, metadata = {}) {
        (0, paymentLogger_1.logPayment)('initiate.start', { orderId: order.id, gateway, email });
        switch (gateway) {
            case 'paystack':
                return this.paystackService.initialize(order, email, currency, metadata);
            case 'flutterwave':
                return this.flutterwaveService.initialize(order, email, currency, metadata);
            default:
                throw new Error(`Unsupported gateway: ${gateway}`);
        }
    }
    async verify(reference, gateway) {
        (0, paymentLogger_1.logPayment)('verify.start', { reference, gateway });
        switch (gateway) {
            case 'paystack':
                return this.paystackService.verify(reference);
            case 'flutterwave':
                return this.flutterwaveService.verify(reference);
            default:
                throw new Error(`Unsupported gateway: ${gateway}`);
        }
    }
}
exports.default = PaymentDispatcher;
