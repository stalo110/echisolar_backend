"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const userController_1 = require("../controllers/userController");
const authMiddleware_1 = require("../middlewares/authMiddleware");
const r = (0, express_1.Router)();
r.get('/me', authMiddleware_1.protect, userController_1.getProfile);
r.put('/me', authMiddleware_1.protect, userController_1.updateProfile);
exports.default = r;
