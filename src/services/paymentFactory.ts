import TransactionRepository from './TransactionRepository';
import PaystackService from './PaystackService';
import FlutterwaveService from './FlutterwaveService';
import PaymentDispatcher from './PaymentDispatcher';

export function createPaymentDispatcher() {
  const transactions = new TransactionRepository();
  const paystack = new PaystackService(transactions);
  const flutterwave = new FlutterwaveService(transactions);
  return new PaymentDispatcher(paystack, flutterwave);
}

export function createPaymentServices() {
  const transactions = new TransactionRepository();
  return {
    transactions,
    paystack: new PaystackService(transactions),
    flutterwave: new FlutterwaveService(transactions),
  };
}
