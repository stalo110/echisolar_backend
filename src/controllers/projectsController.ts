import { Request, Response } from 'express';
import { db } from '../config/db';
import { buildCloudinaryId, uploadBufferToCloudinary } from '../utils/cloudinary';
import { isMulterFileArray } from '../utils/guards';

export const getProjects = async (req: Request, res: Response) => {
  try {
    const [rows] = await db.query('SELECT * FROM projects WHERE isActive = TRUE ORDER BY createdAt DESC');
    res.json(rows);
  } catch (err) {
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
    const { title, description, images: imagesBody = '[]', link, isFeatured = false } = req.body;
    const uploadedUrls: string[] = [];
    if (isMulterFileArray(req.files)) {
      for (const f of req.files) {
        const publicId = buildCloudinaryId('project', f.originalname);
        const secureUrl = await uploadBufferToCloudinary(f.buffer, publicId, 'echisolar/projects');
        uploadedUrls.push(secureUrl);
      }
    }

    const imagesToStore = uploadedUrls.length ? uploadedUrls : (imagesBody ? JSON.parse(imagesBody) : []);

    await db.query(
      'INSERT INTO projects (title, description, images, link, isFeatured, isActive) VALUES (?,?,?,?,?,?)',
      [title, description, JSON.stringify(imagesToStore), link || null, isFeatured ? 1 : 0, 1]
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
    const { title, description, images: imagesBody = '[]', link, isFeatured = false, isActive = true } = req.body;
    const uploadedUrls: string[] = [];
    if (isMulterFileArray(req.files)) {
      for (const f of req.files) {
        const publicId = buildCloudinaryId('project', f.originalname);
        const secureUrl = await uploadBufferToCloudinary(f.buffer, publicId, 'echisolar/projects');
        uploadedUrls.push(secureUrl);
      }
    }

    const imagesToStore = uploadedUrls.length ? uploadedUrls : (imagesBody ? JSON.parse(imagesBody) : []);

    await db.query(
      'UPDATE projects SET title = ?, description = ?, images = ?, link = ?, isFeatured = ?, isActive = ? WHERE id = ?',
      [title, description, JSON.stringify(imagesToStore), link || null, isFeatured ? 1 : 0, isActive ? 1 : 0, id]
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
