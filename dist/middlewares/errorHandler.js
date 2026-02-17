"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = void 0;
function errorHandler(err, req, res, next) {
    console.error(err);
    res.status(err.status || 500).json({ error: err.message || 'Server error' });
}
exports.errorHandler = errorHandler;
