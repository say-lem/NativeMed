import multer, { FileFilterCallback } from 'multer';
import rateLimit from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '../../../shared/utils/apiResponse';

// ─────────────────────────────────────────────────────────────────────────────
// Allowed MIME types and their per-type size caps
// Thumbnail uploads live in courses.upload.ts — not here.
// ─────────────────────────────────────────────────────────────────────────────

export const ALLOWED_CONTENT_TYPES: Record<string, { maxMb: number; label: string }> = {
  'video/mp4':       { maxMb: 500, label: 'video' },
  'video/webm':      { maxMb: 500, label: 'video' },
  'video/quicktime': { maxMb: 500, label: 'video' },
  'audio/mpeg':      { maxMb: 50,  label: 'audio' },  // mp3
  'audio/wav':       { maxMb: 50,  label: 'audio' },
  'audio/ogg':       { maxMb: 50,  label: 'audio' },
  'audio/mp4':       { maxMb: 50,  label: 'audio' },  // m4a
  'audio/x-m4a':     { maxMb: 50,  label: 'audio' },
  'application/pdf': { maxMb: 20,  label: 'pdf'   },
};

// ─────────────────────────────────────────────────────────────────────────────
// File filter — course content only (video / audio / pdf)
// ─────────────────────────────────────────────────────────────────────────────

const contentFileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback,
) => {
  if (ALLOWED_CONTENT_TYPES[file.mimetype]) {
    cb(null, true);
  } else {
    cb(new Error(
      `Unsupported file type "${file.mimetype}". Allowed: mp4, webm, mov, mp3, wav, ogg, m4a, pdf`,
    ));
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Multer instance — memory storage
// Files land in req.file.buffer and are streamed to Cloudinary by the service.
// Global limit is the video ceiling (500 MB).
// Per-type enforcement (audio ≤ 50 MB, pdf ≤ 20 MB) happens inside the service
// after the buffer is available and the mimetype is confirmed.
// ─────────────────────────────────────────────────────────────────────────────

export const uploadContent = multer({
  storage: multer.memoryStorage(),
  fileFilter: contentFileFilter,
  limits: { fileSize: 500 * 1024 * 1024, files: 1 },
});

// ─────────────────────────────────────────────────────────────────────────────
// Upload rate limiter
// Separate from the global limiter — uploads are far more expensive per request.
// 10 uploads/hr per IP is generous for a medical education admin panel.
// ─────────────────────────────────────────────────────────────────────────────

export const uploadRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,  // 1 hour
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Upload limit reached. Try again in an hour.' },
});

// ─────────────────────────────────────────────────────────────────────────────
// Concurrency guard
// Memory uploads are expensive: a 500 MB video holds ~500 MB of heap for the
// entire duration of the Cloudinary upload. This caps simultaneous in-flight
// uploads to prevent OOM crashes under concurrent load.
//
// In production, move large video uploads to a job queue (BullMQ) so the HTTP
// request returns immediately with a job ID. This guard is a lightweight interim
// defence until that's in place.
// ─────────────────────────────────────────────────────────────────────────────

const MAX_CONCURRENT_UPLOADS = 3;
let activeUploads = 0;

export const concurrencyGuard = (
  _req: Request,
  res: Response,
  next: NextFunction,
): void => {
  if (activeUploads >= MAX_CONCURRENT_UPLOADS) {
    ApiResponse.error(res, 'Upload service is busy. Please try again in a moment.', 503);
    return;
  }

  activeUploads++;

  // Decrement on both clean finish and aborted connections
  const release = () => { activeUploads = Math.max(0, activeUploads - 1); };
  res.on('finish', release);
  res.on('close', release);

  next();
};