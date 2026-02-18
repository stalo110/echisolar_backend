import PaystackService from './PaystackService';
import FlutterwaveService from './FlutterwaveService';
import { TransactionGateway } from './TransactionRepository';
import { logPayment } from '../utils/paymentLogger';

export type OrderLike = {
  id: number;
  userId: number;
  totalAmount: number;
};

class PaymentDispatcher {
  constructor(
    private paystackService: PaystackService,
    private flutterwaveService: FlutterwaveService
  ) {}

  async initiate(
    order: OrderLike,
    gateway: TransactionGateway,
    email: string,
    currency: string,
    metadata: Record<string, any> = {},
    options: { planCode?: string; paymentPlanId?: string } = {}
  ) {
    logPayment('initiate.start', { orderId: order.id, gateway, email });

    switch (gateway) {
      case 'paystack':
        return this.paystackService.initialize(order, email, currency, metadata, {
          planCode: options.planCode,
        });
      case 'flutterwave':
        return this.flutterwaveService.initialize(order, email, currency, metadata, {
          paymentPlanId: options.paymentPlanId,
        });
      default:
        throw new Error(`Unsupported gateway: ${gateway}`);
    }
  }

  async createRecurringPlan(
    gateway: TransactionGateway,
    input: {
      name: string;
      amount: number;
      interval: 'daily' | 'weekly' | 'monthly' | 'annually' | 'yearly';
      currency: string;
      duration?: number;
      invoiceLimit?: number;
    }
  ) {
    logPayment('plan.create.start', { gateway, input });
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

  async verify(reference: string, gateway: TransactionGateway) {
    logPayment('verify.start', { reference, gateway });
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

export default PaymentDispatcher;
