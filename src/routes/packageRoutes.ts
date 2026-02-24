import { Router } from 'express';
import {
  createPackage,
  deletePackage,
  getAdminPackages,
  getMyPackageEnrollments,
  getPackageById,
  getPackages,
  optInForCustomPackage,
  updatePackage,
} from '../controllers/packageController';
import { adminOnly, protect } from '../middlewares/authMiddleware';
import upload from '../middlewares/upload';

const r = Router();

r.get('/', getPackages);
r.get('/admin/all', protect, adminOnly, getAdminPackages);
r.get('/me/enrollments', protect, getMyPackageEnrollments);
r.get('/:id', getPackageById);
r.post('/', protect, adminOnly, upload.array('images', 6), createPackage);
r.put('/:id', protect, adminOnly, upload.array('images', 6), updatePackage);
r.delete('/:id', protect, adminOnly, deletePackage);
r.post('/:id/opt-in', protect, optInForCustomPackage);

export default r;
