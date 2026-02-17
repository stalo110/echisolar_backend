"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clearCart = exports.removeCartItem = exports.updateCartItem = exports.addToCart = exports.getCart = void 0;
const db_1 = require("../config/db");
const mapItem = (row) => ({
    id: row.id,
    productId: row.productId,
    name: row.name,
    quantity: row.quantity,
    unitPrice: Number(row.unitPrice ?? row.price ?? 0),
    stock: row.stock,
    images: typeof row.images === 'string' ? JSON.parse(row.images || '[]') : row.images || [],
});
const loadCartItems = async (userId) => {
    const [rows] = await db_1.db.query(`SELECT ci.id, ci.quantity, p.id as productId, p.name, p.stock, COALESCE(p.salePrice, p.price) as unitPrice, p.images
     FROM cartItems ci
     JOIN carts c ON ci.cartId = c.id
     JOIN products p ON p.id = ci.productId
     WHERE c.userId = ?`, [userId]);
    return rows.map(mapItem);
};
const respondWithCart = async (userId, res) => {
    const items = await loadCartItems(userId);
    res.json({ items });
};
const ensureCart = async (userId) => {
    const [rows] = await db_1.db.query('SELECT id FROM carts WHERE userId = ?', [userId]);
    let cart = rows[0];
    if (!cart) {
        const [insertRes] = await db_1.db.query('INSERT INTO carts (userId) VALUES (?)', [userId]);
        cart = { id: insertRes.insertId };
    }
    return cart.id;
};
const getUserId = (req) => req.user.userId;
const getCart = async (req, res) => {
    try {
        return await respondWithCart(getUserId(req), res);
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
};
exports.getCart = getCart;
const addToCart = async (req, res) => {
    const userId = getUserId(req);
    const { productId, quantity = 1 } = req.body;
    try {
        const cartId = await ensureCart(userId);
        const [existingRows] = await db_1.db.query('SELECT id, quantity FROM cartItems WHERE cartId = ? AND productId = ?', [cartId, productId]);
        const existing = existingRows[0];
        if (existing) {
            await db_1.db.query('UPDATE cartItems SET quantity = ? WHERE id = ?', [existing.quantity + Number(quantity), existing.id]);
        }
        else {
            await db_1.db.query('INSERT INTO cartItems (cartId, productId, quantity) VALUES (?,?,?)', [cartId, productId, quantity]);
        }
        await respondWithCart(userId, res);
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
};
exports.addToCart = addToCart;
const updateCartItem = async (req, res) => {
    const userId = getUserId(req);
    const { itemId } = req.params;
    const { quantity } = req.body;
    try {
        await db_1.db.query('UPDATE cartItems ci JOIN carts c ON ci.cartId = c.id SET ci.quantity = ? WHERE ci.id = ? AND c.userId = ?', [quantity, itemId, userId]);
        await respondWithCart(userId, res);
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
};
exports.updateCartItem = updateCartItem;
const removeCartItem = async (req, res) => {
    const userId = getUserId(req);
    const { itemId } = req.params;
    try {
        await db_1.db.query('DELETE ci FROM cartItems ci JOIN carts c ON ci.cartId = c.id WHERE ci.id = ? AND c.userId = ?', [itemId, userId]);
        await respondWithCart(userId, res);
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
};
exports.removeCartItem = removeCartItem;
const clearCart = async (req, res) => {
    const userId = getUserId(req);
    try {
        const [rows] = await db_1.db.query('SELECT id FROM carts WHERE userId = ?', [userId]);
        const cart = rows[0];
        if (cart) {
            await db_1.db.query('DELETE FROM cartItems WHERE cartId = ?', [cart.id]);
        }
        await respondWithCart(userId, res);
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
};
exports.clearCart = clearCart;
