"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteProduct = exports.updateProduct = exports.createProduct = exports.getProductById = exports.getAdminProducts = exports.getProducts = void 0;
const db_1 = require("../config/db");
const cloudinary_1 = require("../utils/cloudinary");
const guards_1 = require("../utils/guards");
const toBoolean = (value, fallback = false) => {
    if (typeof value === 'boolean')
        return value;
    if (typeof value === 'number')
        return value === 1;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'true' || normalized === '1')
            return true;
        if (normalized === 'false' || normalized === '0')
            return false;
    }
    return fallback;
};
const parseImages = (value) => {
    if (Array.isArray(value)) {
        return value.filter((item) => typeof item === 'string');
    }
    if (typeof value !== 'string')
        return [];
    try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
            return parsed.filter((item) => typeof item === 'string');
        }
        return [];
    }
    catch {
        return value ? [value] : [];
    }
};
const getUploadedImageUrls = async (req) => {
    const uploadedUrls = [];
    if (!(0, guards_1.isMulterFileArray)(req.files))
        return uploadedUrls;
    for (const file of req.files) {
        const publicId = (0, cloudinary_1.buildCloudinaryId)('product', file.originalname);
        const secureUrl = await (0, cloudinary_1.uploadBufferToCloudinary)(file.buffer, publicId, 'echisolar/products');
        uploadedUrls.push(secureUrl);
    }
    return uploadedUrls;
};
const getProducts = async (req, res) => {
    const { category, search, isLatestArrival } = req.query;
    let query = 'SELECT * FROM products WHERE isActive = TRUE';
    const params = [];
    if (category) {
        query += ' AND categoryId = ?';
        params.push(category);
    }
    if (search) {
        query += ' AND name LIKE ?';
        params.push(`%${search}%`);
    }
    if (isLatestArrival === 'true') {
        query += ' AND isLatestArrival = TRUE';
    }
    query += ' ORDER BY id DESC';
    try {
        const [rows] = await db_1.db.query(query, params);
        res.json(rows);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
};
exports.getProducts = getProducts;
const getAdminProducts = async (_req, res) => {
    try {
        const [rows] = await db_1.db.query('SELECT * FROM products WHERE isActive = TRUE ORDER BY id DESC');
        res.json(rows);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
};
exports.getAdminProducts = getAdminProducts;
const getProductById = async (req, res) => {
    try {
        const [rows] = await db_1.db.query('SELECT * FROM products WHERE id = ?', [req.params.id]);
        res.json(rows[0]);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
};
exports.getProductById = getProductById;
const createProduct = async (req, res) => {
    try {
        const { name, description, price, stock, categoryId, images: imagesBody, isLatestArrival } = req.body;
        const uploadedUrls = await getUploadedImageUrls(req);
        const imagesToStore = uploadedUrls.length ? uploadedUrls : parseImages(imagesBody);
        await db_1.db.query(`INSERT INTO products (name, description, price, stock, categoryId, images, isLatestArrival)
       VALUES (?,?,?,?,?,?,?)`, [
            name,
            description || null,
            Number(price || 0),
            Number(stock || 0),
            categoryId ? Number(categoryId) : null,
            JSON.stringify(imagesToStore),
            toBoolean(isLatestArrival),
        ]);
        res.status(201).json({ message: 'Product created' });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
};
exports.createProduct = createProduct;
const updateProduct = async (req, res) => {
    const { id } = req.params;
    try {
        const [existingRows] = await db_1.db.query('SELECT * FROM products WHERE id = ? LIMIT 1', [id]);
        const existing = existingRows[0];
        if (!existing)
            return res.status(404).json({ error: 'Product not found' });
        const { name, description, price, stock, categoryId, images: imagesBody, isLatestArrival, isActive, } = req.body;
        const uploadedUrls = await getUploadedImageUrls(req);
        const imagesToStore = uploadedUrls.length
            ? uploadedUrls
            : typeof imagesBody !== 'undefined'
                ? parseImages(imagesBody)
                : parseImages(existing.images);
        await db_1.db.query(`UPDATE products
       SET name = ?, description = ?, price = ?, stock = ?, categoryId = ?, images = ?, isLatestArrival = ?, isActive = ?
       WHERE id = ?`, [
            typeof name === 'undefined' ? existing.name : name,
            typeof description === 'undefined' ? existing.description : description,
            typeof price === 'undefined' ? Number(existing.price || 0) : Number(price || 0),
            typeof stock === 'undefined' ? Number(existing.stock || 0) : Number(stock || 0),
            typeof categoryId === 'undefined' ? existing.categoryId : Number(categoryId || 0),
            JSON.stringify(imagesToStore),
            typeof isLatestArrival === 'undefined' ? toBoolean(existing.isLatestArrival) : toBoolean(isLatestArrival),
            typeof isActive === 'undefined' ? toBoolean(existing.isActive, true) : toBoolean(isActive, true),
            Number(id),
        ]);
        res.json({ message: 'Product updated' });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
};
exports.updateProduct = updateProduct;
const deleteProduct = async (req, res) => {
    const { id } = req.params;
    try {
        await db_1.db.query('UPDATE products SET isActive = FALSE WHERE id = ?', [id]);
        res.json({ message: 'Product archived' });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
};
exports.deleteProduct = deleteProduct;
