import { Router } from 'express';
import {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  getAdminProducts,
} from '../controllers/productController';
import { protect, adminOnly } from '../middlewares/authMiddleware';
import upload from '../middlewares/upload';

const r = Router();
r.get('/', getProducts);
r.get('/admin/all', protect, adminOnly, getAdminProducts);
r.get('/:id', getProductById);
// accept multipart/form-data with field name `images`
r.post('/', protect, adminOnly, upload.array('images', 6), createProduct);
r.put('/:id', protect, adminOnly, upload.array('images', 6), updateProduct);
r.delete('/:id', protect, adminOnly, deleteProduct);

export default r;
