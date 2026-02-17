"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.notifyOrderStakeholders = notifyOrderStakeholders;
const nodemailer_1 = __importDefault(require("nodemailer"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const SMTP_HOST = process.env.INCOMING_SERVER;
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_USER = process.env.USERNAME || process.env.EMAIL;
const SMTP_PASS = process.env.PASSWORD;
const FROM_ADDRESS = process.env.EMAIL || process.env.USERNAME || 'no-reply@echisolar.com';
const ADMIN_EMAIL = process.env.USERNAME || process.env.EMAIL;
if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    throw new Error('Missing SMTP configuration for email notifications');
}
const transporter = nodemailer_1.default.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
    },
});
const formatCurrency = (value, currency) => `${currency.toUpperCase()} ${value.toFixed(2)}`;
const buildItemsSection = (items, currency) => items.map((it) => `${it.name} x${it.quantity} — ${formatCurrency(it.unitPrice, currency)}`).join('\n');
const buildInstallmentSection = (installments, currency) => {
    if (!installments?.length)
        return '';
    return [
        'Installment schedule:',
        ...installments.map((inst) => `  #${inst.installmentNumber}: ${formatCurrency(inst.amount, currency)} due ${inst.dueDate.split(' ')[0]}`),
    ].join('\n');
};
async function notifyOrderStakeholders(options) {
    const { orderId, customerEmail, provider, currency, total, checkoutUrl, items, installments } = options;
    const subject = `EchiSolar Order #${orderId} (${provider})`;
    const itemSection = buildItemsSection(items, currency);
    const installmentSection = buildInstallmentSection(installments, currency);
    const textBody = [
        `Order ${orderId} has been created.`,
        `Total: ${formatCurrency(total, currency)}`,
        `Provider: ${provider}`,
        `Checkout URL: ${checkoutUrl}`,
        '',
        'Items:',
        itemSection,
        installmentSection,
    ]
        .filter(Boolean)
        .join('\n');
    const htmlBody = textBody.replace(/\n/g, '<br/>');
    const recipients = [customerEmail];
    if (ADMIN_EMAIL && !recipients.includes(ADMIN_EMAIL)) {
        recipients.push(ADMIN_EMAIL);
    }
    try {
        await transporter.sendMail({
            from: FROM_ADDRESS,
            to: recipients,
            subject,
            text: textBody,
            html: htmlBody,
        });
    }
    catch (err) {
        console.error('Order notification email failed', err);
    }
}
