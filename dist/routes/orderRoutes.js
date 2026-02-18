"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const orderController_1 = require("../controllers/orderController");
const authMiddleware_1 = require("../middlewares/authMiddleware");
const r = (0, express_1.Router)();
r.post('/checkout', authMiddleware_1.protect, orderController_1.initiateCheckout);
r.get('/', authMiddleware_1.protect, orderController_1.getUserOrders);
r.get('/lookup', authMiddleware_1.protect, orderController_1.getOrderByPaymentReference);
r.get('/:id', authMiddleware_1.protect, orderController_1.getOrderById);
exports.default = r;
//# sourceMappingURL=orderRoutes.js.map