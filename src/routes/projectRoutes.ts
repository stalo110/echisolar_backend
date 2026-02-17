import { Router } from 'express';
import {
  getProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
  getAdminProjects,
} from '../controllers/projectsController';
import { protect, adminOnly } from '../middlewares/authMiddleware';
import upload from '../middlewares/upload';

const r = Router();

r.get('/', getProjects);
r.get('/admin/all', protect, adminOnly, getAdminProjects);
r.get('/:id', getProjectById);
// accept multipart/form-data for images
r.post('/', protect, adminOnly, upload.array('images', 6), createProject);
r.put('/:id', protect, adminOnly, upload.array('images', 6), updateProject);
r.delete('/:id', protect, adminOnly, deleteProject);

export default r;
