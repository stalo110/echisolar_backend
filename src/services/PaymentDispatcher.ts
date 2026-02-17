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

  async initiate(order: OrderLike, gateway: TransactionGateway, email: string, currency: string, metadata: Record<string, any> = {}) {
    logPayment('initiate.start', { orderId: order.id, gateway, email });

    switch (gateway) {
      case 'paystack':
        return this.paystackService.initialize(order, email, currency, metadata);
      case 'flutterwave':
        return this.flutterwaveService.initialize(order, email, currency, metadata);
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
