import { Request, RequestHandler, Response } from 'express';
import { db } from '../config/db';

type AuthReq = Request & { user: { userId: number } };

const mapItem = (row: any) => ({
  id: row.id,
  productId: row.productId,
  name: row.name,
  quantity: row.quantity,
  unitPrice: Number(row.unitPrice ?? row.price ?? 0),
  stock: row.stock,
  images:
    typeof row.images === 'string' ? JSON.parse(row.images || '[]') : row.images || [],
});

const loadCartItems = async (userId: number) => {
  const [rows] = await db.query(
    `SELECT ci.id, ci.quantity, p.id as productId, p.name, p.stock, COALESCE(p.salePrice, p.price) as unitPrice, p.images
     FROM cartItems ci
     JOIN carts c ON ci.cartId = c.id
     JOIN products p ON p.id = ci.productId
     WHERE c.userId = ?`,
    [userId]
  );
  return (rows as any[]).map(mapItem);
};

const respondWithCart = async (userId: number, res: Response) => {
  const items = await loadCartItems(userId);
  res.json({ items });
};

const ensureCart = async (userId: number) => {
  const [rows] = await db.query('SELECT id FROM carts WHERE userId = ?', [userId]);
  let cart = (rows as any[])[0];
  if (!cart) {
    const [insertRes] = await db.query('INSERT INTO carts (userId) VALUES (?)', [userId]);
    cart = { id: (insertRes as any).insertId };
  }
  return cart.id;
};

const getUserId = (req: Request) => (req as AuthReq).user.userId;

export const getCart: RequestHandler = async (req, res) => {
  try {
    return await respondWithCart(getUserId(req), res);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

export const addToCart: RequestHandler = async (req, res) => {
  const userId = getUserId(req);
  const { productId, quantity = 1 } = req.body;
  try {
    const cartId = await ensureCart(userId);
    const [existingRows] = await db.query('SELECT id, quantity FROM cartItems WHERE cartId = ? AND productId = ?', [cartId, productId]);
    const existing = (existingRows as any[])[0];
    if (existing) {
      await db.query('UPDATE cartItems SET quantity = ? WHERE id = ?', [existing.quantity + Number(quantity), existing.id]);
    } else {
      await db.query('INSERT INTO cartItems (cartId, productId, quantity) VALUES (?,?,?)', [cartId, productId, quantity]);
    }
    await respondWithCart(userId, res);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

export const updateCartItem: RequestHandler = async (req, res) => {
  const userId = getUserId(req);
  const { itemId } = req.params;
  const { quantity } = req.body;
  try {
    await db.query(
      'UPDATE cartItems ci JOIN carts c ON ci.cartId = c.id SET ci.quantity = ? WHERE ci.id = ? AND c.userId = ?',
      [quantity, itemId, userId]
    );
    await respondWithCart(userId, res);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

export const removeCartItem: RequestHandler = async (req, res) => {
  const userId = getUserId(req);
  const { itemId } = req.params;
  try {
    await db.query('DELETE ci FROM cartItems ci JOIN carts c ON ci.cartId = c.id WHERE ci.id = ? AND c.userId = ?', [itemId, userId]);
    await respondWithCart(userId, res);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

export const clearCart: RequestHandler = async (req, res) => {
  const userId = getUserId(req);
  try {
    const [rows] = await db.query('SELECT id FROM carts WHERE userId = ?', [userId]);
    const cart = (rows as any[])[0];
    if (cart) {
      await db.query('DELETE FROM cartItems WHERE cartId = ?', [cart.id]);
    }
    await respondWithCart(userId, res);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};
