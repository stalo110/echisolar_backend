import multer from 'multer';

// Use memory storage so we can upload buffers to Cloudinary directly
const storage = multer.memoryStorage();
const upload = multer({ storage });

export default upload;
