import { Router } from 'express';
import authRoutes from './authRoutes';
import productRoutes from './productRoutes';
import projectRoutes from './projectRoutes';
import packageRoutes from './packageRoutes';
import cartRoutes from './cartRoutes';
import orderRoutes from './orderRoutes';
import paymentRoutes from './paymentRoutes';
import userRoutes from './userRoutes';
import adminRoutes from './adminRoutes';
import contactRoutes from './contactRoutes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/products', productRoutes);
router.use('/projects', projectRoutes);
router.use('/packages', packageRoutes);
router.use('/cart', cartRoutes);
router.use('/orders', orderRoutes);
router.use('/payments', paymentRoutes);
router.use('/users', userRoutes);
router.use('/admin', adminRoutes);
router.use('/contact', contactRoutes);

export default router;
