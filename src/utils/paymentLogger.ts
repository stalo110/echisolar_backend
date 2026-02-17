import fs from 'fs';
import path from 'path';

type LogPayload = Record<string, any>;

const logDir = path.join(process.cwd(), 'storage', 'logs');
const paymentsLog = path.join(logDir, 'payments.log');
const webhooksLog = path.join(logDir, 'webhooks.log');

function ensureLogDir() {
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
}

function maskSensitive(value: any): any {
  if (Array.isArray(value)) return value.map(maskSensitive);
  if (value && typeof value === 'object') {
    const masked: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      if (/(authorization|signature|secret|password|token|pin|otp|cvv|card|email)/i.test(k)) {
        masked[k] = '***';
      } else {
        masked[k] = maskSensitive(v);
      }
    }
    return masked;
  }
  return value;
}

function writeLog(filePath: string, payload: LogPayload) {
  ensureLogDir();
  const line = JSON.stringify({ timestamp: new Date().toISOString(), ...payload }) + '\n';
  fs.appendFileSync(filePath, line, { encoding: 'utf8' });
}

export function logPayment(event: string, payload: LogPayload) {
  writeLog(paymentsLog, { event, ...payload });
}

export function logWebhook(event: string, payload: LogPayload) {
  const maskedPayload = maskSensitive(payload);
  writeLog(webhooksLog, { event, ...maskedPayload });
}
