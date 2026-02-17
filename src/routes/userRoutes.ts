import { Router } from 'express';
import { getProfile, updateProfile } from '../controllers/userController';
import { protect } from '../middlewares/authMiddleware';
const r = Router();
r.get('/me', protect, getProfile);
r.put('/me', protect, updateProfile);
export default r;
