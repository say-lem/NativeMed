import { Router } from 'express';
import { authenticate } from '../../../shared/middleware/authenticate';
import { authorize } from '../../../shared/middleware/authorize';
import { validate } from '../../../shared/middleware/validate';
import {
  uploadPdfSchema,
  addDriveLinkSchema,
  updateContentSchema,
} from '../schema/content.schema';
import {
  uploadPdf as uploadPdfMiddleware,
  uploadRateLimiter as uploadRateLimiterMiddleware,
  concurrencyGuard as concurrencyGuardMiddleware,
} from '../upload/content.upload';
import * as contentController from '../controller/content.controller';

const router = Router({ mergeParams: true }); // inherits :courseId from parent

// ── Admin writes (static paths before /:id) ───────────────────────────────────

// ── Admin: upload a PDF (Cloudinary) ──────────────────────────────────────────
router.post(
  '/upload-pdf',
  authenticate,
  authorize('admin'),
  uploadRateLimiterMiddleware,
  concurrencyGuardMiddleware,
  uploadPdfMiddleware.single('file'),
  validate(uploadPdfSchema),
  contentController.uploadPdf,
);

// ── Admin: register a Google Drive video/audio link ───────────────────────────
// No file upload — admin pastes the Drive share link they created manually.
router.post(
  '/drive-link',
  authenticate,
  authorize('admin'),
  validate(addDriveLinkSchema),
  contentController.addDriveLink,
);

// ── Enrolled users (reads) ────────────────────────────────────────────────────
router.get('/', authenticate, contentController.getCourseContents);
router.get('/:id', authenticate, contentController.getContentById);

// ── Admin: update metadata / delete ───────────────────────────────────────────
router.patch('/:id', authenticate, authorize('admin'), validate(updateContentSchema), contentController.updateContent);
router.delete('/:id', authenticate, authorize('admin'), contentController.deleteContent);

export default router;