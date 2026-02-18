"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const projectsController_1 = require("../controllers/projectsController");
const authMiddleware_1 = require("../middlewares/authMiddleware");
const upload_1 = __importDefault(require("../middlewares/upload"));
const r = (0, express_1.Router)();
r.get('/', projectsController_1.getProjects);
r.get('/admin/all', authMiddleware_1.protect, authMiddleware_1.adminOnly, projectsController_1.getAdminProjects);
r.get('/:id', projectsController_1.getProjectById);
// accept multipart/form-data for images
r.post('/', authMiddleware_1.protect, authMiddleware_1.adminOnly, upload_1.default.array('images', 6), projectsController_1.createProject);
r.put('/:id', authMiddleware_1.protect, authMiddleware_1.adminOnly, upload_1.default.array('images', 6), projectsController_1.updateProject);
r.delete('/:id', authMiddleware_1.protect, authMiddleware_1.adminOnly, projectsController_1.deleteProject);
exports.default = r;
//# sourceMappingURL=projectRoutes.js.map