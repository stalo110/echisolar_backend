"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const morgan_1 = __importDefault(require("morgan"));
const helmet_1 = __importDefault(require("helmet"));
const routes_1 = __importDefault(require("./routes"));
const webhookRoutes_1 = __importDefault(require("./routes/webhookRoutes"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const dotenv_1 = __importDefault(require("dotenv"));
const errorHandler_1 = require("./middlewares/errorHandler");
const paymentController_1 = require("./controllers/paymentController");
dotenv_1.default.config();
const app = (0, express_1.default)();
const allowedOrigins = [process.env.FRONTEND_URL, 'http://localhost:5173/'].filter((origin) => Boolean(origin));
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)({ origin: allowedOrigins.length ? allowedOrigins : true }));
app.use((0, morgan_1.default)('dev'));
// capture the raw body for webhook signature verification
app.use(express_1.default.json({
    limit: '2mb',
    verify: (req, _res, buf) => {
        req.rawBody = buf.toString();
    },
}));
app.use(express_1.default.urlencoded({ extended: true, limit: '2mb' }));
const limiter = (0, express_rate_limit_1.default)({ windowMs: 60 * 1000, max: 100 });
app.use(limiter);
app.use('/api', routes_1.default);
app.use('/webhook', webhookRoutes_1.default);
app.get('/verify-payment', paymentController_1.verifyPayment);
app.get('/health', (req, res) => res.json({ ok: true }));
app.use(errorHandler_1.errorHandler);
exports.default = app;
//# sourceMappingURL=app.js.map