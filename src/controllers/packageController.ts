import { Request, RequestHandler, Response } from 'express';
import { db } from '../config/db';
import { buildCloudinaryId, uploadBufferToCloudinary } from '../utils/cloudinary';
import { isMulterFileArray } from '../utils/guards';

type AuthReq = Request & { user: { userId: number } };
type PackageEnrollmentStatus = 'opted_in' | 'pending_payment' | 'paid';

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

const toNullablePrice = (value: unknown) => {
  if (value === null || typeof value === 'undefined') return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Number(parsed.toFixed(2));
};

const parseImages = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  }

  if (typeof value !== 'string') return [];

  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
    }
    return [];
  } catch {
    return value.trim() ? [value.trim()] : [];
  }
};

const containsDataUrl = (images: string[]) =>
  images.some((image) => /^data:image\//i.test(image.trim()));

const getUploadedImageUrls = async (req: any) => {
  const uploadedUrls: string[] = [];
  if (!isMulterFileArray(req.files)) return uploadedUrls;

  for (const file of req.files) {
    const publicId = buildCloudinaryId('package', file.originalname);
    const secureUrl = await uploadBufferToCloudinary(file.buffer, publicId, 'echisolar/packages');
    uploadedUrls.push(secureUrl);
  }

  return uploadedUrls;
};

const normalizePackage = (row: any) => ({
  id: Number(row.id),
  name: String(row.name || ''),
  description: row.description || '',
  price: row.price === null || typeof row.price === 'undefined' ? null : Number(row.price),
  requiresCustomPrice: toBoolean(row.requiresCustomPrice),
  images: parseImages(row.images),
  whatsappLink: row.whatsappLink || null,
  isActive: toBoolean(row.isActive, true),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const resolveEnrollmentStatus = (row: any): PackageEnrollmentStatus => {
  const paymentStatus = String(row.paymentStatus || '').toLowerCase();
  if (row.orderId) {
    if (paymentStatus === 'paid') return 'paid';
    return 'pending_payment';
  }

  const rawStatus = String(row.status || '').toLowerCase();
  if (rawStatus === 'paid') return 'paid';
  if (rawStatus === 'pending_payment') return 'pending_payment';
  return 'opted_in';
};

export const getPackages: RequestHandler = async (_req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM packages WHERE isActive = TRUE ORDER BY createdAt DESC');
    res.json((rows as any[]).map(normalizePackage));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const getAdminPackages: RequestHandler = async (_req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM packages ORDER BY createdAt DESC');
    res.json((rows as any[]).map(normalizePackage));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const getPackageById: RequestHandler = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM packages WHERE id = ? AND isActive = TRUE LIMIT 1', [req.params.id]);
    const pkg = (rows as any[])[0];
    if (!pkg) return res.status(404).json({ error: 'Package not found' });
    res.json(normalizePackage(pkg));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const createPackage = async (req: any, res: Response) => {
  try {
    const {
      name,
      description,
      price,
      requiresCustomPrice,
      images: imagesBody,
      whatsappLink,
      isActive,
    } = req.body;

    const safeName = String(name || '').trim();
    if (!safeName) return res.status(400).json({ error: 'Package name is required' });

    const uploadedUrls = await getUploadedImageUrls(req);
    const imagesToStore = uploadedUrls.length ? uploadedUrls : parseImages(imagesBody);
    if (containsDataUrl(imagesToStore)) {
      return res.status(400).json({
        error: 'Base64 image payloads are not supported. Upload files with multipart/form-data using field "images".',
      });
    }

    const customPricing = toBoolean(requiresCustomPrice);
    const parsedPrice = customPricing ? null : toNullablePrice(price);
    if (!customPricing && parsedPrice === null) {
      return res.status(400).json({ error: 'Price is required when custom pricing is disabled' });
    }

    const [result] = await db.query(
      `INSERT INTO packages (name, description, price, requiresCustomPrice, images, whatsappLink, isActive)
       VALUES (?,?,?,?,?,?,?)`,
      [
        safeName,
        String(description || '').trim() || null,
        parsedPrice,
        customPricing ? 1 : 0,
        JSON.stringify(imagesToStore),
        String(whatsappLink || '').trim() || null,
        typeof isActive === 'undefined' ? 1 : toBoolean(isActive, true) ? 1 : 0,
      ]
    );

    res.status(201).json({
      message: 'Package created',
      id: (result as any).insertId,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const updatePackage = async (req: any, res: Response) => {
  const { id } = req.params;
  try {
    const [rows] = await db.query('SELECT * FROM packages WHERE id = ? LIMIT 1', [id]);
    const existing = (rows as any[])[0];
    if (!existing) return res.status(404).json({ error: 'Package not found' });

    const {
      name,
      description,
      price,
      requiresCustomPrice,
      images: imagesBody,
      whatsappLink,
      isActive,
    } = req.body;

    const uploadedUrls = await getUploadedImageUrls(req);
    const imagesToStore = uploadedUrls.length
      ? uploadedUrls
      : typeof imagesBody !== 'undefined'
      ? parseImages(imagesBody)
      : parseImages(existing.images);

    if (containsDataUrl(imagesToStore)) {
      return res.status(400).json({
        error: 'Base64 image payloads are not supported. Upload files with multipart/form-data using field "images".',
      });
    }

    const nextRequiresCustomPrice =
      typeof requiresCustomPrice === 'undefined'
        ? toBoolean(existing.requiresCustomPrice)
        : toBoolean(requiresCustomPrice);

    const currentPrice = toNullablePrice(existing.price);
    const nextPrice = nextRequiresCustomPrice
      ? null
      : typeof price === 'undefined'
      ? currentPrice
      : toNullablePrice(price);

    if (!nextRequiresCustomPrice && nextPrice === null) {
      return res.status(400).json({ error: 'Price is required when custom pricing is disabled' });
    }

    await db.query(
      `UPDATE packages
       SET name = ?, description = ?, price = ?, requiresCustomPrice = ?, images = ?, whatsappLink = ?, isActive = ?
       WHERE id = ?`,
      [
        typeof name === 'undefined' ? existing.name : String(name || '').trim(),
        typeof description === 'undefined' ? existing.description : String(description || '').trim() || null,
        nextPrice,
        nextRequiresCustomPrice ? 1 : 0,
        JSON.stringify(imagesToStore),
        typeof whatsappLink === 'undefined' ? existing.whatsappLink : String(whatsappLink || '').trim() || null,
        typeof isActive === 'undefined' ? (toBoolean(existing.isActive, true) ? 1 : 0) : toBoolean(isActive, true) ? 1 : 0,
        Number(id),
      ]
    );

    res.json({ message: 'Package updated' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const deletePackage: RequestHandler = async (req, res) => {
  const packageId = Number(req.params.id);
  if (!Number.isFinite(packageId) || packageId < 1) {
    return res.status(400).json({ error: 'Invalid package id' });
  }

  try {
    const [orderRefRows] = await db.query(
      'SELECT COUNT(*) AS total FROM orderItems WHERE packageId = ?',
      [packageId]
    );
    const totalOrderRefs = Number((orderRefRows as any[])[0]?.total || 0);
    if (totalOrderRefs > 0) {
      return res
        .status(409)
        .json({ error: 'Package cannot be deleted because it is linked to existing orders.' });
    }

    await db.query("DELETE FROM cartItems WHERE packageId = ? AND itemType = 'package'", [packageId]);

    const [result] = await db.query('DELETE FROM packages WHERE id = ?', [packageId]);
    if (Number((result as any).affectedRows || 0) === 0) {
      return res.status(404).json({ error: 'Package not found' });
    }

    res.json({ message: 'Package deleted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const optInForCustomPackage: RequestHandler = async (req, res) => {
  const userId = (req as AuthReq).user.userId;
  const packageId = Number(req.params.id);
  if (!Number.isFinite(packageId) || packageId < 1) {
    return res.status(400).json({ error: 'Invalid package id' });
  }

  try {
    const [rows] = await db.query('SELECT id, name, isActive, requiresCustomPrice, whatsappLink FROM packages WHERE id = ? LIMIT 1', [
      packageId,
    ]);
    const pkg = (rows as any[])[0];
    if (!pkg || !toBoolean(pkg.isActive, true)) {
      return res.status(404).json({ error: 'Package not found' });
    }

    if (!toBoolean(pkg.requiresCustomPrice)) {
      return res.status(400).json({ error: 'This package has fixed pricing. Add it to cart instead.' });
    }

    const notes = String(req.body?.notes || '').trim() || null;
    const [existingRows] = await db.query(
      `SELECT id
       FROM userPackageEnrollments
       WHERE userId = ? AND packageId = ? AND status = 'opted_in'
       ORDER BY id DESC
       LIMIT 1`,
      [userId, packageId]
    );

    const existing = (existingRows as any[])[0];
    if (existing) {
      await db.query(
        `UPDATE userPackageEnrollments
         SET notes = ?, source = 'custom_request', orderId = NULL, selectedPrice = NULL, updatedAt = NOW()
         WHERE id = ?`,
        [notes, existing.id]
      );
    } else {
      await db.query(
        `INSERT INTO userPackageEnrollments (userId, packageId, status, source, notes)
         VALUES (?,?,?,?,?)`,
        [userId, packageId, 'opted_in', 'custom_request', notes]
      );
    }

    return res.status(201).json({
      message: `Request submitted for ${String(pkg.name || 'this package')}`,
      whatsappLink: pkg.whatsappLink || null,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Server error' });
  }
};

export const getMyPackageEnrollments: RequestHandler = async (req, res) => {
  const userId = (req as AuthReq).user.userId;

  try {
    const [rows] = await db.query(
      `SELECT
         upe.id,
         upe.packageId,
         upe.orderId,
         upe.status,
         upe.source,
         upe.selectedPrice,
         upe.notes,
         upe.createdAt,
         upe.updatedAt,
         p.name,
         p.description,
         p.price,
         p.requiresCustomPrice,
         p.images,
         p.whatsappLink,
         o.paymentStatus,
         o.status AS orderStatus,
         o.placedAt,
         o.totalAmount
       FROM userPackageEnrollments upe
       JOIN packages p ON p.id = upe.packageId
       LEFT JOIN orders o ON o.id = upe.orderId
       WHERE upe.userId = ?
       ORDER BY upe.updatedAt DESC, upe.id DESC`,
      [userId]
    );

    const data = (rows as any[]).map((row) => ({
      id: Number(row.id),
      packageId: Number(row.packageId),
      orderId: row.orderId === null || typeof row.orderId === 'undefined' ? null : Number(row.orderId),
      name: String(row.name || ''),
      description: row.description || '',
      images: parseImages(row.images),
      packagePrice: row.price === null || typeof row.price === 'undefined' ? null : Number(row.price),
      selectedPrice:
        row.selectedPrice === null || typeof row.selectedPrice === 'undefined' ? null : Number(row.selectedPrice),
      requiresCustomPrice: toBoolean(row.requiresCustomPrice),
      status: resolveEnrollmentStatus(row),
      source: String(row.source || 'custom_request'),
      notes: row.notes || null,
      paymentStatus: row.paymentStatus || null,
      orderStatus: row.orderStatus || null,
      placedAt: row.placedAt || null,
      totalAmount: row.totalAmount === null || typeof row.totalAmount === 'undefined' ? null : Number(row.totalAmount),
      whatsappLink: row.whatsappLink || null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));

    res.json(data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};
