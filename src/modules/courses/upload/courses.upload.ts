import multer, { FileFilterCallback } from 'multer';
import { Request } from 'express';

// ─────────────────────────────────────────────────────────────────────────────
// Allowed MIME types
// ─────────────────────────────────────────────────────────────────────────────

const ALLOWED_THUMBNAIL_TYPES: Record<string, boolean> = {
  'image/jpeg': true,
  'image/png':  true,
  'image/webp': true,
};

// ─────────────────────────────────────────────────────────────────────────────
// File filter
// Rejects anything that isn't a supported image type before the buffer is
// even allocated — fail fast before wasting memory or a Cloudinary round-trip.
// ─────────────────────────────────────────────────────────────────────────────

const thumbnailFileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback,
) => {
  if (ALLOWED_THUMBNAIL_TYPES[file.mimetype]) {
    cb(null, true);
  } else {
    cb(
      new Error(
        `Unsupported image type "${file.mimetype}". Allowed formats: jpg, png, webp`,
      ),
    );
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Multer instance — memory storage
// The buffer is streamed to Cloudinary by courses.service.ts.
// 5 MB is more than enough for a 800×450 thumbnail even at high quality.
// ─────────────────────────────────────────────────────────────────────────────

export const uploadCourseThumbnail = multer({
  storage: multer.memoryStorage(),
  fileFilter: thumbnailFileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB
    files: 1,
  },
});