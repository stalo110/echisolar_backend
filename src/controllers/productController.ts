import { Request, Response } from 'express';
import { db } from '../config/db';
import { buildCloudinaryId, uploadBufferToCloudinary } from '../utils/cloudinary';
import { isMulterFileArray } from '../utils/guards';


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

  const [rows] = await db.query(query, params);
  res.json(rows);
};

export const getProductById = async (req: Request, res: Response) => {
  const [rows] = await db.query('SELECT * FROM products WHERE id = ?', [req.params.id]);
  res.json((rows as any[])[0]);
};

export const createProduct = async (req: any, res: Response) => {
  try {
    const { name, description, price, stock, categoryId, images: imagesBody, isLatestArrival } = req.body;
    const uploadedUrls: string[] = [];

    // if files were uploaded via multer (memory storage)
    if (isMulterFileArray(req.files)) {
      for (const f of req.files) {
        const publicId = buildCloudinaryId('product', f.originalname);
        const secureUrl = await uploadBufferToCloudinary(f.buffer, publicId, 'echisolar/products');
        uploadedUrls.push(secureUrl);
      }
    }

    const imagesToStore = uploadedUrls.length ? uploadedUrls : (imagesBody ? JSON.parse(imagesBody) : []);

    await db.query(
      'INSERT INTO products (name, description, price, stock, categoryId, images, isLatestArrival) VALUES (?,?,?,?,?,?,?)',
      [name, description, price, stock, categoryId, JSON.stringify(imagesToStore), isLatestArrival]
    );
    res.status(201).json({ message: 'Product created' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};
