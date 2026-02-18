import { Router } from 'express';
import { createContactMessage } from '../controllers/contactController';

const r = Router();

r.post('/', createContactMessage);

export default r;
