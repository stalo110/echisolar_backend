import multer from 'multer';

// Use memory storage so we can upload buffers to Cloudinary directly
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    files: 6,
    fileSize: 10 * 1024 * 1024, // 10MB per file
  },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      cb(new Error('Only image uploads are allowed'));
      return;
    }
    cb(null, true);
  },
});

export default upload;
