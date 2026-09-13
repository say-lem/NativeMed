import multer, { FileFilterCallback } from 'multer';
import { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '../../../shared/utils/apiResponse';
import { createLeakyBucketLimiter } from '../../../shared/middleware/leakyBucket';

const PDF_MIME = new Set(['application/pdf']);
const MAX_PDF_MB = 50;

const pdfFileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback,
) => {
  if (PDF_MIME.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Only PDF files are accepted here. Received: ${file.mimetype}`));
  }
};

// Memory storage — buffer is streamed to Cloudinary by the service layer
export const uploadPdf = multer({
  storage: multer.memoryStorage(),
  fileFilter: pdfFileFilter,
  limits: { fileSize: MAX_PDF_MB * 1024 * 1024, files: 1 },
});

const IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_IMAGE_MB = 5;

const imageFileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback,
) => {
  if (IMAGE_MIME.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Unsupported image type "${file.mimetype}". Allowed formats: jpg, png, webp`));
  }
};

// Blog cover image — memory storage, streamed to Cloudinary by the service layer
export const uploadCoverImage = multer({
  storage: multer.memoryStorage(),
  fileFilter: imageFileFilter,
  limits: { fileSize: MAX_IMAGE_MB * 1024 * 1024, files: 1 },
});

// ─────────────────────────────────────────────────────────────────────────────
// Rate limiter — 20 uploads (PDF or blog cover) per hour per IP
// ─────────────────────────────────────────────────────────────────────────────

export const uploadRateLimiter = createLeakyBucketLimiter({
  capacity: 20,
  windowMs: 60 * 60 * 1000,
  message: 'Upload limit reached. Try again in an hour.',
});

// ─────────────────────────────────────────────────────────────────────────────
// Concurrency guard — caps simultaneous in-flight Cloudinary uploads
// ─────────────────────────────────────────────────────────────────────────────

const MAX_CONCURRENT = 5;
let active = 0;

export const concurrencyGuard = (
  _req: Request,
  res: Response,
  next: NextFunction,
): void => {
  if (active >= MAX_CONCURRENT) {
    ApiResponse.error(res, 'Upload service busy — please try again shortly.', 503);
    return;
  }
  active++;
  const release = () => { active = Math.max(0, active - 1); };
  res.on('finish', release);
  res.on('close', release);
  next();
};
