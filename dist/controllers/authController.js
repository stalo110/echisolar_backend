"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.login = exports.register = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const db_1 = require("../config/db");
const jwt_1 = require("../utils/jwt");
const register = async (req, res) => {
    const { name, email, password, country } = req.body;
    try {
        const [existing] = await db_1.db.query('SELECT id FROM users WHERE email = ?', [email]);
        if (existing.length > 0)
            return res.status(400).json({ message: 'Email already exists' });
        const hashed = await bcryptjs_1.default.hash(password, 10);
        const [result] = await db_1.db.query('INSERT INTO users (name, email, passwordHash, country) VALUES (?,?,?,?)', [
            name,
            email,
            hashed,
            country || null,
        ]);
        const userId = result.insertId;
        const token = (0, jwt_1.generateToken)(userId, 'user');
        res.status(201).json({
            token,
            user: {
                id: userId,
                name,
                email,
                country: country || null,
                role: 'user',
            },
        });
    }
    catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
};
exports.register = register;
const login = async (req, res) => {
    const { email, password } = req.body;
    try {
        const [rows] = await db_1.db.query('SELECT * FROM users WHERE email = ?', [email]);
        const user = rows[0];
        if (!user)
            return res.status(404).json({ message: 'User not found' });
        const match = await bcryptjs_1.default.compare(password, user.passwordHash);
        if (!match)
            return res.status(401).json({ message: 'Invalid credentials' });
        const token = (0, jwt_1.generateToken)(user.id, user.role);
        res.json({ token, user: { id: user.id, name: user.name, role: user.role } });
    }
    catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
};
exports.login = login;
