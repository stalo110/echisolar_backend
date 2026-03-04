import { Router } from 'express';
import { forgotPassword, login, register, resetPassword } from '../controllers/authController';
const r = Router();
r.post('/register', register);
r.post('/login', login);
r.post('/forgot-password', forgotPassword);
r.post('/reset-password', resetPassword);
export default r;
