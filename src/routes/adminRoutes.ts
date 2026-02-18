import { Router } from 'express';
import { adminOnly, protect } from '../middlewares/authMiddleware';
import {
  getAdminOrders,
  getAdminUsers,
  getDashboardStats,
  getRevenueAnalytics,
} from '../controllers/adminController';
import {
  getAdminMessageById,
  getAdminMessages,
  replyToAdminMessage,
  updateAdminMessageStatus,
} from '../controllers/contactController';

const r = Router();

r.get('/dashboard', protect, adminOnly, getDashboardStats);
r.get('/orders', protect, adminOnly, getAdminOrders);
r.get('/users', protect, adminOnly, getAdminUsers);
r.get('/revenue', protect, adminOnly, getRevenueAnalytics);
r.get('/messages', protect, adminOnly, getAdminMessages);
r.get('/messages/:id', protect, adminOnly, getAdminMessageById);
r.put('/messages/:id/reply', protect, adminOnly, replyToAdminMessage);
r.put('/messages/:id/status', protect, adminOnly, updateAdminMessageStatus);

export default r;
