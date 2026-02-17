"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isMulterFileArray = isMulterFileArray;
function isMulterFileArray(obj) {
    return Array.isArray(obj) && obj.every((f) => {
        return f && typeof f === 'object' && Buffer.isBuffer(f.buffer);
    });
}
