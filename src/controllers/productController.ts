import { Request, Response } from 'express';
import { db } from '../config/db';
import { buildCloudinaryId, uploadBufferToCloudinary } from '../utils/cloudinary';
import { isMulterFileArray } from '../utils/guards';

const toBoolean = (value: unknown, fallback = false) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') return true;
    if (normalized === 'false' || normalized === '0') return false;
  }
  return fallback;
};

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

const getUploadedImageUrls = async (req: any) => {
  const uploadedUrls: string[] = [];
  if (!isMulterFileArray(req.files)) return uploadedUrls;

  for (const file of req.files) {
    const publicId = buildCloudinaryId('product', file.originalname);
    const secureUrl = await uploadBufferToCloudinary(file.buffer, publicId, 'echisolar/products');
    uploadedUrls.push(secureUrl);
  }

  return uploadedUrls;
};

export const getProducts = async (req: Request, res: Response) => {
  const { category, search, isLatestArrival } = req.query;
  let query = 'SELECT * FROM products WHERE isActive = TRUE';
  const params: any[] = [];

  if (category) {
    query += ' AND categoryId = ?';
    params.push(category);
  }
  if (search) {
    query += ' AND name LIKE ?';
    params.push(`%${search}%`);
  }
  if (isLatestArrival === 'true') {
    query += ' AND isLatestArrival = TRUE';
  }

  query += ' ORDER BY id DESC';

  try {
    const [rows] = await db.query(query, params);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const getAdminProducts = async (_req: Request, res: Response) => {
  try {
    const [rows] = await db.query('SELECT * FROM products WHERE isActive = TRUE ORDER BY id DESC');
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const getProductById = async (req: Request, res: Response) => {
  try {
    const [rows] = await db.query('SELECT * FROM products WHERE id = ?', [req.params.id]);
    res.json((rows as any[])[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const createProduct = async (req: any, res: Response) => {
  try {
    const { name, description, price, stock, categoryId, images: imagesBody, isLatestArrival } = req.body;
    const uploadedUrls = await getUploadedImageUrls(req);
    const imagesToStore = uploadedUrls.length ? uploadedUrls : parseImages(imagesBody);

    await db.query(
      `INSERT INTO products (name, description, price, stock, categoryId, images, isLatestArrival)
       VALUES (?,?,?,?,?,?,?)`,
      [
        name,
        description || null,
        Number(price || 0),
        Number(stock || 0),
        categoryId ? Number(categoryId) : null,
        JSON.stringify(imagesToStore),
        toBoolean(isLatestArrival),
      ]
    );

    res.status(201).json({ message: 'Product created' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const updateProduct = async (req: any, res: Response) => {
  const { id } = req.params;
  try {
    const [existingRows] = await db.query('SELECT * FROM products WHERE id = ? LIMIT 1', [id]);
    const existing = (existingRows as any[])[0];
    if (!existing) return res.status(404).json({ error: 'Product not found' });

    const {
      name,
      description,
      price,
      stock,
      categoryId,
      images: imagesBody,
      isLatestArrival,
      isActive,
    } = req.body;

    const uploadedUrls = await getUploadedImageUrls(req);
    const imagesToStore = uploadedUrls.length
      ? uploadedUrls
      : typeof imagesBody !== 'undefined'
      ? parseImages(imagesBody)
      : parseImages(existing.images);

    await db.query(
      `UPDATE products
       SET name = ?, description = ?, price = ?, stock = ?, categoryId = ?, images = ?, isLatestArrival = ?, isActive = ?
       WHERE id = ?`,
      [
        typeof name === 'undefined' ? existing.name : name,
        typeof description === 'undefined' ? existing.description : description,
        typeof price === 'undefined' ? Number(existing.price || 0) : Number(price || 0),
        typeof stock === 'undefined' ? Number(existing.stock || 0) : Number(stock || 0),
        typeof categoryId === 'undefined' ? existing.categoryId : Number(categoryId || 0),
        JSON.stringify(imagesToStore),
        typeof isLatestArrival === 'undefined' ? toBoolean(existing.isLatestArrival) : toBoolean(isLatestArrival),
        typeof isActive === 'undefined' ? toBoolean(existing.isActive, true) : toBoolean(isActive, true),
        Number(id),
      ]
    );

    res.json({ message: 'Product updated' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const deleteProduct = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    await db.query('UPDATE products SET isActive = FALSE WHERE id = ?', [id]);
    res.json({ message: 'Product archived' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};
