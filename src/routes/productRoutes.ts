import { Router } from 'express';
import { getProducts, getProductById, createProduct } from '../controllers/productController';
import { protect, adminOnly } from '../middlewares/authMiddleware';
import upload from '../middlewares/upload';

const r = Router();
 r.get('/', getProducts);
 r.get('/:id', getProductById);
 // accept multipart/form-data with field name `images`
 r.post('/', protect, adminOnly, upload.array('images', 6), createProduct);
 export default r;
