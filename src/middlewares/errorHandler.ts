import { Request, Response, NextFunction } from 'express';

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  console.error(err);
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({
      error:
        'request entity too large. Upload images as multipart/form-data using field "images" instead of base64 JSON.',
    });
  }

  res.status(err.status || 500).json({ error: err.message || 'Server error' });
}
