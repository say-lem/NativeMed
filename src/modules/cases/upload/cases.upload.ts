import multer, { FileFilterCallback } from 'multer';
import { Request } from 'express';

const ALLOWED_IMAGE_TYPES: Record<string, boolean> = {
  'image/jpeg': true,
  'image/png': true,
  'image/webp': true,
};

const imageFileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback,
) => {
  if (ALLOWED_IMAGE_TYPES[file.mimetype]) {
    cb(null, true);
  } else {
    cb(
      new Error(
        `Unsupported image type "${file.mimetype}". Allowed formats: jpg, png, webp`,
      ),
    );
  }
};

export const uploadCaseImage = multer({
  storage: multer.memoryStorage(),
  fileFilter: imageFileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
  },
});
