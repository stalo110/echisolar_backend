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

const containsDataUrl = (images: string[]) =>
  images.some((image) => /^data:image\//i.test(image.trim()));

const getUploadedImageUrls = async (req: any) => {
  const uploadedUrls: string[] = [];
  if (!isMulterFileArray(req.files)) return uploadedUrls;

  for (const file of req.files) {
    const publicId = buildCloudinaryId('project', file.originalname);
    const secureUrl = await uploadBufferToCloudinary(file.buffer, publicId, 'echisolar/projects');
    uploadedUrls.push(secureUrl);
  }

  return uploadedUrls;
};

export const getProjects = async (req: Request, res: Response) => {
  try {
    const [rows] = await db.query('SELECT * FROM projects WHERE isActive = TRUE ORDER BY createdAt DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

export const getAdminProjects = async (_req: Request, res: Response) => {
  try {
    const [rows] = await db.query('SELECT * FROM projects ORDER BY createdAt DESC');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

export const getProjectById = async (req: Request, res: Response) => {
  try {
    const [rows] = await db.query('SELECT * FROM projects WHERE id = ?', [req.params.id]);
    res.json((rows as any[])[0] || null);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

export const createProject = async (req: any, res: Response) => {
  try {
    const { title, description, images: imagesBody, link, isFeatured } = req.body;
    const uploadedUrls = await getUploadedImageUrls(req);
    const imagesToStore = uploadedUrls.length ? uploadedUrls : parseImages(imagesBody);
    if (containsDataUrl(imagesToStore)) {
      return res.status(400).json({
        error: 'Base64 image payloads are not supported. Upload files with multipart/form-data using field "images".',
      });
    }

    await db.query(
      'INSERT INTO projects (title, description, images, link, isFeatured, isActive) VALUES (?,?,?,?,?,?)',
      [title, description, JSON.stringify(imagesToStore), link || null, toBoolean(isFeatured) ? 1 : 0, 1]
    );
    res.status(201).json({ message: 'Project created' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

export const updateProject = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const { title, description, images: imagesBody, link, isFeatured, isActive } = req.body;
    const [existingRows] = await db.query('SELECT * FROM projects WHERE id = ? LIMIT 1', [id]);
    const existing = (existingRows as any[])[0];
    if (!existing) return res.status(404).json({ error: 'Project not found' });

    const uploadedUrls = await getUploadedImageUrls(req);
    const hasImagesBody = typeof imagesBody !== 'undefined';
    const imagesToStore = uploadedUrls.length
      ? uploadedUrls
      : hasImagesBody
      ? parseImages(imagesBody)
      : parseImages(existing.images);
    if (containsDataUrl(imagesToStore)) {
      return res.status(400).json({
        error: 'Base64 image payloads are not supported. Upload files with multipart/form-data using field "images".',
      });
    }

    await db.query(
      'UPDATE projects SET title = ?, description = ?, images = ?, link = ?, isFeatured = ?, isActive = ? WHERE id = ?',
      [
        typeof title === 'undefined' ? existing.title : title,
        typeof description === 'undefined' ? existing.description : description,
        JSON.stringify(imagesToStore),
        typeof link === 'undefined' ? existing.link : link || null,
        (typeof isFeatured === 'undefined' ? toBoolean(existing.isFeatured) : toBoolean(isFeatured)) ? 1 : 0,
        (typeof isActive === 'undefined' ? toBoolean(existing.isActive, true) : toBoolean(isActive, true)) ? 1 : 0,
        id,
      ]
    );
    res.json({ message: 'Project updated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

export const deleteProject = async (req: Request, res: Response) => {
  try {
    const { id } = req.params as any;
    await db.query('DELETE FROM projects WHERE id = ?', [id]);
    res.json({ message: 'Project deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};
