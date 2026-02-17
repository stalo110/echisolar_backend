"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createProduct = exports.getProductById = exports.getProducts = void 0;
const db_1 = require("../config/db");
const cloudinary_1 = require("../utils/cloudinary");
const guards_1 = require("../utils/guards");
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
    const [rows] = await db_1.db.query(query, params);
    res.json(rows);
};
exports.getProducts = getProducts;
const getProductById = async (req, res) => {
    const [rows] = await db_1.db.query('SELECT * FROM products WHERE id = ?', [req.params.id]);
    res.json(rows[0]);
};
exports.getProductById = getProductById;
const createProduct = async (req, res) => {
    try {
        const { name, description, price, stock, categoryId, images: imagesBody, isLatestArrival } = req.body;
        const uploadedUrls = [];
        // if files were uploaded via multer (memory storage)
        if ((0, guards_1.isMulterFileArray)(req.files)) {
            for (const f of req.files) {
                const publicId = (0, cloudinary_1.buildCloudinaryId)('product', f.originalname);
                const secureUrl = await (0, cloudinary_1.uploadBufferToCloudinary)(f.buffer, publicId, 'echisolar/products');
                uploadedUrls.push(secureUrl);
            }
        }
        const imagesToStore = uploadedUrls.length ? uploadedUrls : (imagesBody ? JSON.parse(imagesBody) : []);
        await db_1.db.query('INSERT INTO products (name, description, price, stock, categoryId, images, isLatestArrival) VALUES (?,?,?,?,?,?,?)', [name, description, price, stock, categoryId, JSON.stringify(imagesToStore), isLatestArrival]);
        res.status(201).json({ message: 'Product created' });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
};
exports.createProduct = createProduct;
