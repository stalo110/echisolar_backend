"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authController_1 = require("../controllers/authController");
const r = (0, express_1.Router)();
r.post('/register', authController_1.register);
r.post('/login', authController_1.login);
exports.default = r;
