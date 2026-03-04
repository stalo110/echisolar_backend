"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logWebhook = exports.logPayment = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const logDir = path_1.default.join(process.cwd(), 'storage', 'logs');
const paymentsLog = path_1.default.join(logDir, 'payments.log');
const webhooksLog = path_1.default.join(logDir, 'webhooks.log');
function ensureLogDir() {
    if (!fs_1.default.existsSync(logDir)) {
        fs_1.default.mkdirSync(logDir, { recursive: true });
    }
}
function maskSensitive(value) {
    if (Array.isArray(value))
        return value.map(maskSensitive);
    if (value && typeof value === 'object') {
        const masked = {};
        for (const [k, v] of Object.entries(value)) {
            if (/(authorization|signature|secret|password|token|pin|otp|cvv|card|email)/i.test(k)) {
                masked[k] = '***';
            }
            else {
                masked[k] = maskSensitive(v);
            }
        }
        return masked;
    }
    return value;
}
function writeLog(filePath, payload) {
    ensureLogDir();
    const line = JSON.stringify({ timestamp: new Date().toISOString(), ...payload }) + '\n';
    fs_1.default.appendFileSync(filePath, line, { encoding: 'utf8' });
}
function logPayment(event, payload) {
    writeLog(paymentsLog, { event, ...payload });
}
exports.logPayment = logPayment;
function logWebhook(event, payload) {
    const maskedPayload = maskSensitive(payload);
    writeLog(webhooksLog, { event, ...maskedPayload });
}
exports.logWebhook = logWebhook;
//# sourceMappingURL=paymentLogger.js.map