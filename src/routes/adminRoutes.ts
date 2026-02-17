import { Router } from 'express';
import { adminOnly, protect } from '../middlewares/authMiddleware';
import {
  getAdminOrders,
  getAdminUsers,
  getDashboardStats,
  getRevenueAnalytics,
} from '../controllers/adminController';

const r = Router();

r.get('/dashboard', protect, adminOnly, getDashboardStats);
r.get('/orders', protect, adminOnly, getAdminOrders);
r.get('/users', protect, adminOnly, getAdminUsers);
r.get('/revenue', protect, adminOnly, getRevenueAnalytics);

export default r;

