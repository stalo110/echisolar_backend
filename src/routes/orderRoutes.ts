import { Router } from 'express';
import { initiateCheckout, getOrderById, getUserOrders, getOrderByPaymentReference } from '../controllers/orderController';
import { protect, adminOnly } from '../middlewares/authMiddleware';
const r = Router();
r.post('/checkout', protect, initiateCheckout);
r.get('/', protect, getUserOrders);
r.get('/lookup', protect, getOrderByPaymentReference);
r.get('/:id', protect, getOrderById);
export default r;
