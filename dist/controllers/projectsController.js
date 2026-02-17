"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteProject = exports.updateProject = exports.createProject = exports.getProjectById = exports.getAdminProjects = exports.getProjects = void 0;
const db_1 = require("../config/db");
const cloudinary_1 = require("../utils/cloudinary");
const guards_1 = require("../utils/guards");
const getProjects = async (req, res) => {
    try {
        const [rows] = await db_1.db.query('SELECT * FROM projects WHERE isActive = TRUE ORDER BY createdAt DESC');
        res.json(rows);
    }
    catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
};
exports.getProjects = getProjects;
const getAdminProjects = async (_req, res) => {
    try {
        const [rows] = await db_1.db.query('SELECT * FROM projects ORDER BY createdAt DESC');
        res.json(rows);
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
};
exports.getAdminProjects = getAdminProjects;
const getProjectById = async (req, res) => {
    try {
        const [rows] = await db_1.db.query('SELECT * FROM projects WHERE id = ?', [req.params.id]);
        res.json(rows[0] || null);
    }
    catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
};
exports.getProjectById = getProjectById;
const createProject = async (req, res) => {
    try {
        const { title, description, images: imagesBody = '[]', link, isFeatured = false } = req.body;
        const uploadedUrls = [];
        if ((0, guards_1.isMulterFileArray)(req.files)) {
            for (const f of req.files) {
                const publicId = (0, cloudinary_1.buildCloudinaryId)('project', f.originalname);
                const secureUrl = await (0, cloudinary_1.uploadBufferToCloudinary)(f.buffer, publicId, 'echisolar/projects');
                uploadedUrls.push(secureUrl);
            }
        }
        const imagesToStore = uploadedUrls.length ? uploadedUrls : (imagesBody ? JSON.parse(imagesBody) : []);
        await db_1.db.query('INSERT INTO projects (title, description, images, link, isFeatured, isActive) VALUES (?,?,?,?,?,?)', [title, description, JSON.stringify(imagesToStore), link || null, isFeatured ? 1 : 0, 1]);
        res.status(201).json({ message: 'Project created' });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
};
exports.createProject = createProject;
const updateProject = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, description, images: imagesBody = '[]', link, isFeatured = false, isActive = true } = req.body;
        const uploadedUrls = [];
        if ((0, guards_1.isMulterFileArray)(req.files)) {
            for (const f of req.files) {
                const publicId = (0, cloudinary_1.buildCloudinaryId)('project', f.originalname);
                const secureUrl = await (0, cloudinary_1.uploadBufferToCloudinary)(f.buffer, publicId, 'echisolar/projects');
                uploadedUrls.push(secureUrl);
            }
        }
        const imagesToStore = uploadedUrls.length ? uploadedUrls : (imagesBody ? JSON.parse(imagesBody) : []);
        await db_1.db.query('UPDATE projects SET title = ?, description = ?, images = ?, link = ?, isFeatured = ?, isActive = ? WHERE id = ?', [title, description, JSON.stringify(imagesToStore), link || null, isFeatured ? 1 : 0, isActive ? 1 : 0, id]);
        res.json({ message: 'Project updated' });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
};
exports.updateProject = updateProject;
const deleteProject = async (req, res) => {
    try {
        const { id } = req.params;
        await db_1.db.query('DELETE FROM projects WHERE id = ?', [id]);
        res.json({ message: 'Project deleted' });
    }
    catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
};
exports.deleteProject = deleteProject;
