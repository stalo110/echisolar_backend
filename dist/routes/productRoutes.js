"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const productController_1 = require("../controllers/productController");
const authMiddleware_1 = require("../middlewares/authMiddleware");
const upload_1 = __importDefault(require("../middlewares/upload"));
const r = (0, express_1.Router)();
r.get('/', productController_1.getProducts);
r.get('/:id', productController_1.getProductById);
// accept multipart/form-data with field name `images`
r.post('/', authMiddleware_1.protect, authMiddleware_1.adminOnly, upload_1.default.array('images', 6), productController_1.createProduct);
exports.default = r;
