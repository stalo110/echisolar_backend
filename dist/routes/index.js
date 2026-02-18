"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authRoutes_1 = __importDefault(require("./authRoutes"));
const productRoutes_1 = __importDefault(require("./productRoutes"));
const projectRoutes_1 = __importDefault(require("./projectRoutes"));
const cartRoutes_1 = __importDefault(require("./cartRoutes"));
const orderRoutes_1 = __importDefault(require("./orderRoutes"));
const paymentRoutes_1 = __importDefault(require("./paymentRoutes"));
const userRoutes_1 = __importDefault(require("./userRoutes"));
const adminRoutes_1 = __importDefault(require("./adminRoutes"));
const router = (0, express_1.Router)();
router.use('/auth', authRoutes_1.default);
router.use('/products', productRoutes_1.default);
router.use('/projects', projectRoutes_1.default);
router.use('/cart', cartRoutes_1.default);
router.use('/orders', orderRoutes_1.default);
router.use('/payments', paymentRoutes_1.default);
router.use('/users', userRoutes_1.default);
router.use('/admin', adminRoutes_1.default);
exports.default = router;
//# sourceMappingURL=index.js.map