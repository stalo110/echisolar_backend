"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const paymentLogger_1 = require("../utils/paymentLogger");
class PaymentDispatcher {
    constructor(paystackService, flutterwaveService) {
        this.paystackService = paystackService;
        this.flutterwaveService = flutterwaveService;
    }
    async initiate(order, gateway, email, currency, metadata = {}, options = {}) {
        (0, paymentLogger_1.logPayment)('initiate.start', { orderId: order.id, gateway, email });
        switch (gateway) {
            case 'paystack':
                return this.paystackService.initialize(order, email, currency, metadata, {
                    planCode: options.planCode,
                    callbackUrl: options.callbackUrl,
                });
            case 'flutterwave':
                return this.flutterwaveService.initialize(order, email, currency, metadata, {
                    paymentPlanId: options.paymentPlanId,
                    redirectUrl: options.redirectUrl,
                });
            default:
                throw new Error(`Unsupported gateway: ${gateway}`);
        }
    }
    async createRecurringPlan(gateway, input) {
        (0, paymentLogger_1.logPayment)('plan.create.start', { gateway, input });
        switch (gateway) {
            case 'paystack': {
                const data = await this.paystackService.createPlan({
                    name: input.name,
                    amount: input.amount,
                    interval: input.interval === 'yearly' ? 'annually' : input.interval,
                    currency: input.currency,
                    invoiceLimit: input.invoiceLimit,
                });
                return { planCode: data.planCode, raw: data.raw };
            }
            case 'flutterwave': {
                const data = await this.flutterwaveService.createPaymentPlan({
                    name: input.name,
                    amount: input.amount,
                    interval: input.interval === 'annually' ? 'yearly' : input.interval,
                    currency: input.currency,
                    duration: input.duration,
                });
                return { paymentPlanId: data.id, raw: data.raw };
            }
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
