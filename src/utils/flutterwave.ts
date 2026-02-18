import fetch from 'node-fetch';

const FLUTTERWAVE_SECRET_KEY = process.env.FLUTTERWAVE_SECRET_KEY;
const FLUTTERWAVE_ENCRYPTION_KEY = process.env.FLUTTERWAVE_ENCRYPTION_KEY;
const FLUTTERWAVE_SECRET_HASH = process.env.FLUTTERWAVE_SECRET_HASH || process.env.FLUTTERWAVE_WEBHOOK_HASH;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

if (!FLUTTERWAVE_SECRET_KEY || !FLUTTERWAVE_ENCRYPTION_KEY || !FLUTTERWAVE_SECRET_HASH) {
  throw new Error('Missing Flutterwave configuration in environment variables');
}

export interface FlutterwaveInitOptions {
  amount: number;
  email: string;
  metadata?: Record<string, any>;
  currency?: string;
  redirectPath?: string;
  paymentOptions?: string;
  title?: string;
  description?: string;
  txRef?: string;
}

export async function initializeFlutterwaveTransaction({
  amount,
  email,
  metadata = {},
  currency = 'NGN',
  redirectPath = '/flutterwave/callback',
  paymentOptions = 'card,ussd',
  title = 'EchiSolar payment',
  description = 'Order checkout',
  txRef,
}: FlutterwaveInitOptions) {
  const numericAmount = Number(amount);
  if (Number.isNaN(numericAmount) || numericAmount <= 0) {
    throw new Error('Invalid amount for Flutterwave');
  }

  const tx_ref = txRef || `echisolar-${metadata.orderId ?? 'order'}-${Date.now()}`;
  const response = await fetch('https://api.flutterwave.com/v3/payments', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${FLUTTERWAVE_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      tx_ref,
      amount: numericAmount,
      currency: currency.toUpperCase(),
      redirect_url: `${FRONTEND_URL}${redirectPath}`,
      payment_options: paymentOptions,
      customer: { email },
      meta: metadata,
      customizations: { title, description },
    }),
  });

  const json = await response.json();
  if (json.status !== 'success') {
    throw new Error(json.message || 'Flutterwave initialization failed');
  }

  return {
    ...json.data,
    tx_ref,
  };
}

export async function verifyFlutterwaveTransaction(transactionId: string) {
  const response = await fetch(`https://api.flutterwave.com/v3/transactions/${transactionId}/verify`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${FLUTTERWAVE_SECRET_KEY}`,
    },
  });
  const json = await response.json();
  if (json.status !== 'success') {
    throw new Error(json.message || 'Flutterwave verification failed');
  }
  return json.data;
}

export function verifyFlutterwaveSignature(_rawBody: string | undefined, signature?: string) {
  if (!signature) return false;
  return signature === FLUTTERWAVE_SECRET_HASH;
}
