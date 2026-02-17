"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPaymentServices = exports.createPaymentDispatcher = void 0;
const TransactionRepository_1 = __importDefault(require("./TransactionRepository"));
const PaystackService_1 = __importDefault(require("./PaystackService"));
const FlutterwaveService_1 = __importDefault(require("./FlutterwaveService"));
const PaymentDispatcher_1 = __importDefault(require("./PaymentDispatcher"));
function createPaymentDispatcher() {
    const transactions = new TransactionRepository_1.default();
    const paystack = new PaystackService_1.default(transactions);
    const flutterwave = new FlutterwaveService_1.default(transactions);
    return new PaymentDispatcher_1.default(paystack, flutterwave);
}
exports.createPaymentDispatcher = createPaymentDispatcher;
function createPaymentServices() {
    const transactions = new TransactionRepository_1.default();
    return {
        transactions,
        paystack: new PaystackService_1.default(transactions),
        flutterwave: new FlutterwaveService_1.default(transactions),
    };
}
exports.createPaymentServices = createPaymentServices;
