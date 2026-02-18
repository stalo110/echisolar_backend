"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = void 0;
function errorHandler(err, req, res, next) {
    console.error(err);
    if (err?.type === 'entity.too.large') {
        return res.status(413).json({
            error: 'request entity too large. Upload images as multipart/form-data using field "images" instead of base64 JSON.',
        });
    }
    res.status(err.status || 500).json({ error: err.message || 'Server error' });
}
exports.errorHandler = errorHandler;
