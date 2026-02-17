import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import multer from 'multer';
import path from 'path';
import { randomUUID } from 'crypto';

dotenv.config();

const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;
const DEFAULT_FOLDER = '517-vip-suites';

if (!cloudName || !apiKey || !apiSecret) {
  throw new Error('Missing Cloudinary configuration in environment variables');
}

cloudinary.config({
  cloud_name: cloudName,
  api_key: apiKey,
  api_secret: apiSecret,
});

const normalizeNamePart = (value?: string) => {
  if (!value) return '';
  const baseName = path.parse(value).name;
  return baseName
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
};

export const buildCloudinaryId = (prefix: string, originalName?: string) => {
  const normalized = normalizeNamePart(originalName) || 'asset';
  return `${prefix}-${normalized}-${randomUUID()}`;
};

export const uploadBufferToCloudinary = (buffer: Buffer, filename: string, folder = DEFAULT_FOLDER) =>
  new Promise<string>((resolve, reject) => {
    const normalized = normalizeNamePart(filename) || 'asset';
    const publicId = `${normalized}-${randomUUID()}`;
    const uploader = cloudinary.uploader.upload_stream(
      {
        resource_type: 'image',
        folder,
        public_id: publicId,
        overwrite: false,
      },
      (error, result) => {
        if (error || !result) {
          reject(error || new Error('Cloudinary upload failed'));
          return;
        }
        resolve(result.secure_url);
      }
    );

    uploader.end(buffer);
  });

const storage = new CloudinaryStorage({
  cloudinary,
  params: async () => ({
    folder: DEFAULT_FOLDER,
    resource_type: 'image',
  }),
});

export const uploadImages = multer({ storage });
