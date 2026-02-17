import fetch from 'node-fetch';

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY!;
const APP_URL = process.env.APP_URL || process.env.FRONTEND_URL || 'http://localhost:3000';

export async function initializePaystackTransaction({ amount, email, metadata = {} }: { amount: number; email: string; metadata?: any }) {
  const res = await fetch('https://api.paystack.co/transaction/initialize', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email,
      amount: Math.round(amount * 100),
      callback_url: `${APP_URL}/verify-payment?gateway=paystack`,
      metadata
    })
  });
  const json = await res.json();
  if (!json.status) throw new Error(json.message || 'Paystack init failed');
  return json.data;
}

export async function verifyPaystackTransaction(reference: string) {
  const res = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` }
  });
  const json = await res.json();
  if (!json.status) throw new Error(json.message || 'Paystack verify failed');
  return json.data;
}
