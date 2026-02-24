import { Request, RequestHandler, Response } from 'express';
import { db } from '../config/db';

type AuthReq = Request & { user: { userId: number } };
type CartItemType = 'product' | 'package';

type CartItemRow = {
  id: number;
  quantity: number;
  itemType: CartItemType;
  productId: number | null;
  packageId: number | null;
  name: string;
  unitPrice: number;
  stock: number | null;
  images: string[];
};

const normalizeItemType = (value: unknown): CartItemType =>
  String(value || '').toLowerCase() === 'package' ? 'package' : 'product';

const parseImages = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }

  if (typeof value !== 'string') return [];

  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === 'string');
    }
    return [];
  } catch {
    return value ? [value] : [];
  }
};

const toNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const mapItem = (row: any): CartItemRow | null => {
  const itemType = normalizeItemType(row.itemType);
  const isPackage = itemType === 'package';
  const productId = isPackage ? null : (Number(row.productId) || null);
  const packageId = isPackage ? (Number(row.packageId) || null) : null;
  const name = isPackage ? row.packageName : row.productName;
  const unitPrice = isPackage ? toNumber(row.packageUnitPrice, NaN) : toNumber(row.productUnitPrice, NaN);

  if (!name || !Number.isFinite(unitPrice)) return null;

  return {
    id: Number(row.id),
    quantity: isPackage ? 1 : Math.max(1, toNumber(row.quantity, 1)),
    itemType,
    productId,
    packageId,
    name: String(name),
    unitPrice,
    stock: isPackage ? null : toNumber(row.productStock, 0),
    images: parseImages(isPackage ? row.packageImages : row.productImages),
  };
};

const loadCartItems = async (userId: number) => {
  const [rows] = await db.query(
    `SELECT
       ci.id,
       ci.quantity,
       ci.itemType,
       ci.productId,
       ci.packageId,
       p.name AS productName,
       COALESCE(p.salePrice, p.price) AS productUnitPrice,
       p.stock AS productStock,
       p.images AS productImages,
       pk.name AS packageName,
       pk.price AS packageUnitPrice,
       pk.images AS packageImages
     FROM cartItems ci
     JOIN carts c ON ci.cartId = c.id
     LEFT JOIN products p ON ci.itemType = 'product' AND p.id = ci.productId AND p.isActive = TRUE
     LEFT JOIN packages pk ON ci.itemType = 'package' AND pk.id = ci.packageId AND pk.isActive = TRUE
     WHERE c.userId = ?
     ORDER BY ci.id DESC`,
    [userId]
  );

  return (rows as any[])
    .map((row) => mapItem(row))
    .filter((row): row is CartItemRow => Boolean(row));
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
  return Number(cart.id);
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
  const itemType = normalizeItemType(req.body.itemType);
  const requestedQty = Math.max(1, Number(req.body.quantity || 1));

  const rawItemId =
    itemType === 'package'
      ? req.body.packageId ?? req.body.productId
      : req.body.productId;
  const itemId = Number(rawItemId);

  if (!Number.isFinite(itemId) || itemId < 1) {
    return res.status(400).json({ error: 'Invalid item id' });
  }

  try {
    if (itemType === 'product') {
      const [productRows] = await db.query('SELECT id FROM products WHERE id = ? AND isActive = TRUE LIMIT 1', [
        itemId,
      ]);
      if (!(productRows as any[])[0]) {
        return res.status(404).json({ error: 'Product not found' });
      }
    } else {
      const [packageRows] = await db.query(
        'SELECT id, requiresCustomPrice, price FROM packages WHERE id = ? AND isActive = TRUE LIMIT 1',
        [itemId]
      );
      const pkg = (packageRows as any[])[0];
      if (!pkg) {
        return res.status(404).json({ error: 'Package not found' });
      }
      if (toNumber(pkg.requiresCustomPrice, 0) === 1) {
        return res.status(400).json({ error: 'This package requires custom pricing and cannot be added to cart' });
      }
      if (pkg.price === null || typeof pkg.price === 'undefined') {
        return res.status(400).json({ error: 'Package price is unavailable' });
      }
    }

    const cartId = await ensureCart(userId);
    const productId = itemType === 'product' ? itemId : null;
    const packageId = itemType === 'package' ? itemId : null;

    const [existingRows] = await db.query(
      `SELECT id, quantity
       FROM cartItems
       WHERE cartId = ? AND itemType = ? AND productId <=> ? AND packageId <=> ?
       LIMIT 1`,
      [cartId, itemType, productId, packageId]
    );

    const existing = (existingRows as any[])[0];
    if (existing) {
      const nextQty = itemType === 'package' ? 1 : Number(existing.quantity || 0) + requestedQty;
      await db.query('UPDATE cartItems SET quantity = ? WHERE id = ?', [nextQty, existing.id]);
    } else {
      const quantity = itemType === 'package' ? 1 : requestedQty;
      await db.query(
        'INSERT INTO cartItems (cartId, productId, packageId, itemType, quantity) VALUES (?,?,?,?,?)',
        [cartId, productId, packageId, itemType, quantity]
      );
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
    const [rows] = await db.query(
      `SELECT ci.id, ci.itemType
       FROM cartItems ci
       JOIN carts c ON ci.cartId = c.id
       WHERE ci.id = ? AND c.userId = ?
       LIMIT 1`,
      [itemId, userId]
    );

    const cartItem = (rows as any[])[0];
    if (!cartItem) return res.status(404).json({ error: 'Cart item not found' });

    const itemType = normalizeItemType(cartItem.itemType);
    const nextQuantity = itemType === 'package' ? 1 : Math.max(1, Number(quantity || 1));

    await db.query(
      'UPDATE cartItems ci JOIN carts c ON ci.cartId = c.id SET ci.quantity = ? WHERE ci.id = ? AND c.userId = ?',
      [nextQuantity, itemId, userId]
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
    await db.query('DELETE ci FROM cartItems ci JOIN carts c ON ci.cartId = c.id WHERE ci.id = ? AND c.userId = ?', [
      itemId,
      userId,
    ]);
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
