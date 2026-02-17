"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isMulterFileArray = void 0;
function isMulterFileArray(obj) {
    return Array.isArray(obj) && obj.every((f) => {
        return f && typeof f === 'object' && Buffer.isBuffer(f.buffer);
    });
}
exports.isMulterFileArray = isMulterFileArray;
