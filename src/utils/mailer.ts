import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import { db } from '../config/db';

dotenv.config();

const SMTP_HOST = process.env.SMTP_HOST || process.env.INCOMING_SERVER || '';
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_USER = process.env.SMTP_USER || process.env.USERNAME || process.env.EMAIL || '';
const SMTP_PASS = process.env.SMTP_PASS || process.env.PASSWORD || '';
const FROM_ADDRESS =
  process.env.SMTP_FROM || process.env.EMAIL || process.env.USERNAME || 'no-reply@echisolar.com';
const ADMIN_EMAIL =
  process.env.ADMIN_NOTIFICATION_EMAIL || process.env.USERNAME || process.env.EMAIL || '';

type EmailStatus = 'queued' | 'sent' | 'failed' | 'skipped';
type MailContext = Record<string, any> | null;

let cachedTransporter: nodemailer.Transporter | null | undefined;

const getTransporter = () => {
  if (cachedTransporter !== undefined) return cachedTransporter;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    cachedTransporter = null;
    return cachedTransporter;
  }

  cachedTransporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
  return cachedTransporter;
};

const truncate = (value: string, max = 1000) => (value.length > max ? `${value.slice(0, max)}...` : value);

const writeEmailLog = async (params: {
  type: string;
  toEmail: string;
  subject: string;
  status: EmailStatus;
  providerMessageId?: string | null;
  errorMessage?: string | null;
  context?: MailContext;
}) => {
  try {
    await db.query(
      `INSERT INTO email_logs (type, toEmail, subject, status, providerMessageId, errorMessage, context, sentAt)
       VALUES (?,?,?,?,?,?,?,?)`,
      [
        params.type,
        params.toEmail,
        params.subject,
        params.status,
        params.providerMessageId || null,
        params.errorMessage ? truncate(params.errorMessage, 5000) : null,
        params.context ? JSON.stringify(params.context) : null,
        params.status === 'sent' ? new Date() : null,
      ]
    );
  } catch (err) {
    // Keep email delivery flow resilient even if log insert fails.
    console.error('Email log insert failed', err);
  }
};

const sendEmail = async (params: {
  type: string;
  to: string;
  subject: string;
  html: string;
  text?: string;
  context?: MailContext;
}) => {
  const transporter = getTransporter();

  if (!transporter) {
    await writeEmailLog({
      type: params.type,
      toEmail: params.to,
      subject: params.subject,
      status: 'skipped',
      errorMessage: 'SMTP config missing. Email skipped.',
      context: params.context || null,
    });
    return { ok: false, skipped: true as const };
  }

  try {
    const info = await transporter.sendMail({
      from: FROM_ADDRESS,
      to: params.to,
      subject: params.subject,
      text: params.text || params.html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ''),
      html: params.html,
    });

    await writeEmailLog({
      type: params.type,
      toEmail: params.to,
      subject: params.subject,
      status: 'sent',
      providerMessageId: String(info?.messageId || ''),
      context: params.context || null,
    });
    return { ok: true as const, messageId: String(info?.messageId || '') };
  } catch (err: any) {
    await writeEmailLog({
      type: params.type,
      toEmail: params.to,
      subject: params.subject,
      status: 'failed',
      errorMessage: err?.message || 'Email send failed',
      context: params.context || null,
    });
    return { ok: false as const, error: err?.message || 'Email send failed' };
  }
};

export const hasPaymentConfirmationEmailLog = async (reference: string) => {
  const normalized = String(reference || '').trim();
  if (!normalized) return false;
  try {
    const [rows] = await db.query(
      `SELECT id
       FROM email_logs
       WHERE type = 'payment_confirmation'
         AND JSON_UNQUOTE(JSON_EXTRACT(context, '$.reference')) = ?
       LIMIT 1`,
      [normalized]
    );
    return Boolean((rows as any[])[0]);
  } catch {
    return false;
  }
};

export interface OrderNotificationOptions {
  orderId: number;
  customerEmail: string;
  provider: string;
  currency: string;
  total: number | string;
  checkoutUrl: string;
  items: { name: string; quantity: number; unitPrice: number | string }[];
  installments?: { installmentNumber: number; amount: number | string; dueDate: string }[];
}

const toSafeAmount = (value: unknown) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const formatCurrency = (value: number | string, currency: string) =>
  `${String(currency || 'NGN').toUpperCase()} ${toSafeAmount(value).toFixed(2)}`;

const buildItemsSection = (items: OrderNotificationOptions['items'], currency: string) =>
  items.map((it) => `<li>${it.name} x${it.quantity} - ${formatCurrency(it.unitPrice, currency)}</li>`).join('');

const buildInstallmentSection = (installments: OrderNotificationOptions['installments'] | undefined, currency: string) => {
  if (!installments?.length) return '';
  return `
    <p><strong>Installment schedule</strong></p>
    <ul>
      ${installments
        .map(
          (inst) =>
            `<li>#${inst.installmentNumber}: ${formatCurrency(inst.amount, currency)} due ${String(inst.dueDate).split(' ')[0]}</li>`
        )
        .join('')}
    </ul>
  `;
};

export async function notifyOrderStakeholders(options: OrderNotificationOptions) {
  const { orderId, customerEmail, provider, currency, total, checkoutUrl, items, installments } = options;
  const subject = `EchiSolar Order #${orderId} checkout started`;
  const htmlBody = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6;">
      <h2>Order #${orderId} initialized</h2>
      <p>Total: <strong>${formatCurrency(total, currency)}</strong></p>
      <p>Provider: <strong>${provider}</strong></p>
      <p>Checkout URL: <a href="${checkoutUrl}">${checkoutUrl}</a></p>
      <p><strong>Items</strong></p>
      <ul>${buildItemsSection(items, currency)}</ul>
      ${buildInstallmentSection(installments, currency)}
    </div>
  `;

  const context = {
    orderId,
    provider,
    reference: null,
    checkoutUrl,
    total: toSafeAmount(total),
    currency,
  };

  await sendEmail({
    type: 'checkout_started',
    to: customerEmail,
    subject,
    html: htmlBody,
    context,
  });

  if (ADMIN_EMAIL && ADMIN_EMAIL !== customerEmail) {
    await sendEmail({
      type: 'admin_checkout_alert',
      to: ADMIN_EMAIL,
      subject: `Admin Alert: ${subject}`,
      html: htmlBody,
      context,
    });
  }
}

export const sendWelcomeEmail = async (params: { name: string; email: string }) => {
  const name = String(params.name || '').trim() || 'there';
  const email = String(params.email || '').trim();
  if (!email) return { ok: false as const, skipped: true as const };

  const subject = 'Welcome to EchiSolar';
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6;">
      <h2>Welcome, ${name}!</h2>
      <p>Thanks for creating your EchiSolar account.</p>
      <p>You can now track orders, manage subscriptions, and update your profile from your dashboard.</p>
      <p>Need help? Reply to this email and our team will assist you.</p>
    </div>
  `;

  return sendEmail({
    type: 'welcome',
    to: email,
    subject,
    html,
    context: { name },
  });
};

export type PaymentSuccessNotificationInput = {
  orderId: number;
  provider: string;
  reference: string;
  amount: number;
  currency: string;
  customerName: string;
  customerEmail: string;
  deliveryAddress?: string | null;
  items: Array<{ name: string; quantity: number; unitPrice: number }>;
};

export const sendPaymentSuccessNotifications = async (input: PaymentSuccessNotificationInput) => {
  const subject = `Payment confirmed for Order #${input.orderId}`;
  const itemRows = input.items
    .map((item) => `<li>${item.name} x${item.quantity} - ${formatCurrency(item.unitPrice, input.currency)}</li>`)
    .join('');

  const customerHtml = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6;">
      <h2>Payment confirmed</h2>
      <p>Hello ${input.customerName || 'Customer'},</p>
      <p>Your payment for order <strong>#${input.orderId}</strong> has been confirmed.</p>
      <p>Reference: <strong>${input.reference}</strong></p>
      <p>Gateway: <strong>${input.provider}</strong></p>
      <p>Amount: <strong>${formatCurrency(input.amount, input.currency)}</strong></p>
      ${input.deliveryAddress ? `<p>Delivery address: <strong>${input.deliveryAddress}</strong></p>` : ''}
      <p><strong>Order summary</strong></p>
      <ul>${itemRows || '<li>No items found</li>'}</ul>
    </div>
  `;

  const context = {
    orderId: input.orderId,
    provider: input.provider,
    reference: input.reference,
    amount: input.amount,
    currency: input.currency,
    deliveryAddress: input.deliveryAddress || null,
  };

  await sendEmail({
    type: 'payment_confirmation',
    to: input.customerEmail,
    subject,
    html: customerHtml,
    context,
  });

  if (ADMIN_EMAIL) {
    const adminHtml = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2>Admin payment alert</h2>
        <p>Order <strong>#${input.orderId}</strong> was paid successfully.</p>
        <p>Customer: <strong>${input.customerName}</strong> (${input.customerEmail})</p>
        <p>Reference: <strong>${input.reference}</strong></p>
        <p>Gateway: <strong>${input.provider}</strong></p>
        <p>Amount: <strong>${formatCurrency(input.amount, input.currency)}</strong></p>
        <p>Delivery address: <strong>${input.deliveryAddress || 'N/A'}</strong></p>
        <p><strong>Order summary</strong></p>
        <ul>${itemRows || '<li>No items found</li>'}</ul>
      </div>
    `;

    await sendEmail({
      type: 'admin_payment_alert',
      to: ADMIN_EMAIL,
      subject: `Admin Alert: ${subject}`,
      html: adminHtml,
      context,
    });
  }
};

export const sendPaymentSuccessNotificationsByOrder = async (params: {
  orderId: number;
  provider: string;
  reference: string;
  amount: number;
  currency: string;
}) => {
  const reference = String(params.reference || '').trim();
  if (!reference) return;

  const alreadySent = await hasPaymentConfirmationEmailLog(reference);
  if (alreadySent) return;

  const [rows] = await db.query(
    `SELECT o.id AS orderId, o.totalAmount, u.name AS customerName, u.email AS customerEmail, u.address
     FROM orders o
     JOIN users u ON u.id = o.userId
     WHERE o.id = ?
     LIMIT 1`,
    [params.orderId]
  );
  const order = (rows as any[])[0];
  if (!order?.customerEmail) return;

  const [itemRows] = await db.query(
    `SELECT p.name, oi.quantity, oi.unitPrice
     FROM orderItems oi
     JOIN products p ON p.id = oi.productId
     WHERE oi.orderId = ?`,
    [params.orderId]
  );

  await sendPaymentSuccessNotifications({
    orderId: Number(order.orderId),
    provider: params.provider,
    reference,
    amount: Number(params.amount || order.totalAmount || 0),
    currency: String(params.currency || 'NGN').toUpperCase(),
    customerName: String(order.customerName || 'Customer'),
    customerEmail: String(order.customerEmail),
    deliveryAddress: String(order.address || '').trim() || null,
    items: (itemRows as any[]).map((row) => ({
      name: String(row.name || ''),
      quantity: Number(row.quantity || 0),
      unitPrice: Number(row.unitPrice || 0),
    })),
  });
};

export const sendContactReplyEmail = async (params: {
  recipientEmail: string;
  recipientName: string;
  subject: string;
  originalMessage: string;
  adminReply: string;
  messageId: number;
}) => {
  const to = String(params.recipientEmail || '').trim();
  if (!to) return { ok: false as const, skipped: true as const };

  const subject = `Reply to your message: ${params.subject || 'Contact request'}`;
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6;">
      <h2>Hello ${params.recipientName || 'there'},</h2>
      <p>Thanks for contacting EchiSolar. Our team has replied to your message.</p>
      <p><strong>Your message:</strong></p>
      <blockquote style="border-left: 3px solid #d0d0d0; margin: 0; padding-left: 10px;">
        ${params.originalMessage}
      </blockquote>
      <p><strong>Our reply:</strong></p>
      <p>${params.adminReply}</p>
      <p>If you need more help, just reply to this email.</p>
    </div>
  `;

  return sendEmail({
    type: 'contact_reply',
    to,
    subject,
    html,
    context: {
      messageId: params.messageId,
      contactSubject: params.subject,
    },
  });
};
