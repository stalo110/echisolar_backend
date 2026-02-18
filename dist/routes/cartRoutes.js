"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const cartController_1 = require("../controllers/cartController");
const authMiddleware_1 = require("../middlewares/authMiddleware");
const r = (0, express_1.Router)();
r.get('/', authMiddleware_1.protect, cartController_1.getCart);
r.post('/', authMiddleware_1.protect, cartController_1.addToCart);
r.put('/:itemId', authMiddleware_1.protect, cartController_1.updateCartItem);
r.delete('/', authMiddleware_1.protect, cartController_1.clearCart);
r.delete('/:itemId', authMiddleware_1.protect, cartController_1.removeCartItem);
exports.default = r;
//# sourceMappingURL=cartRoutes.js.map