"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateProfile = exports.getProfile = void 0;
const db_1 = require("../config/db");
const getProfile = async (req, res) => {
    const userId = req.user.userId;
    const [rows] = await db_1.db.query('SELECT id, name, email, role, address, country, createdAt FROM users WHERE id = ?', [userId]);
    res.json(rows[0]);
};
exports.getProfile = getProfile;
const updateProfile = async (req, res) => {
    const userId = req.user.userId;
    const { name, address, country } = req.body;
    await db_1.db.query('UPDATE users SET name = ?, address = ?, country = ? WHERE id = ?', [name, address, country, userId]);
    res.json({ message: 'Updated' });
};
exports.updateProfile = updateProfile;
//# sourceMappingURL=userController.js.map