"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchWithTimeout = fetchWithTimeout;
const node_fetch_1 = __importDefault(require("node-fetch"));
async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await (0, node_fetch_1.default)(url, { ...options, signal: controller.signal });
        return res;
    }
    finally {
        clearTimeout(timeout);
    }
}
//# sourceMappingURL=http.js.map