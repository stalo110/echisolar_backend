export interface MulterLikeFile {
  buffer: Buffer;
  originalname?: string;
  mimetype?: string;
}

export function isMulterFileArray(obj: any): obj is MulterLikeFile[] {
  return Array.isArray(obj) && obj.every((f) => {
    return f && typeof f === 'object' && Buffer.isBuffer((f as any).buffer);
  });
}
