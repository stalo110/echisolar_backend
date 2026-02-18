"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadImages = exports.uploadBufferToCloudinary = exports.buildCloudinaryId = void 0;
const cloudinary_1 = require("cloudinary");
const dotenv_1 = __importDefault(require("dotenv"));
const multer_storage_cloudinary_1 = require("multer-storage-cloudinary");
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const crypto_1 = require("crypto");
dotenv_1.default.config();
const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;
const DEFAULT_FOLDER = '517-vip-suites';
if (!cloudName || !apiKey || !apiSecret) {
    throw new Error('Missing Cloudinary configuration in environment variables');
}
cloudinary_1.v2.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
});
const normalizeNamePart = (value) => {
    if (!value)
        return '';
    const baseName = path_1.default.parse(value).name;
    return baseName
        .replace(/[^a-zA-Z0-9_-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase();
};
const buildCloudinaryId = (prefix, originalName) => {
    const normalized = normalizeNamePart(originalName) || 'asset';
    return `${prefix}-${normalized}-${(0, crypto_1.randomUUID)()}`;
};
exports.buildCloudinaryId = buildCloudinaryId;
const uploadBufferToCloudinary = (buffer, filename, folder = DEFAULT_FOLDER) => new Promise((resolve, reject) => {
    const normalized = normalizeNamePart(filename) || 'asset';
    const publicId = `${normalized}-${(0, crypto_1.randomUUID)()}`;
    const uploader = cloudinary_1.v2.uploader.upload_stream({
        resource_type: 'image',
        folder,
        public_id: publicId,
        overwrite: false,
    }, (error, result) => {
        if (error || !result) {
            reject(error || new Error('Cloudinary upload failed'));
            return;
        }
        resolve(result.secure_url);
    });
    uploader.end(buffer);
});
exports.uploadBufferToCloudinary = uploadBufferToCloudinary;
const storage = new multer_storage_cloudinary_1.CloudinaryStorage({
    cloudinary: cloudinary_1.v2,
    params: async () => ({
        folder: DEFAULT_FOLDER,
        resource_type: 'image',
    }),
});
exports.uploadImages = (0, multer_1.default)({ storage });
//# sourceMappingURL=cloudinary.js.map