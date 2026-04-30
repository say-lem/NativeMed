import { Router } from 'express';
import { authenticate } from '../../../shared/middleware/authenticate';
import { authorize } from '../../../shared/middleware/authorize';
import { validate } from '../../../shared/middleware/validate';
import { uploadContentSchema, updateContentSchema } from '../schema/content.schema';
import {
  uploadContent,
  uploadRateLimiter,
  concurrencyGuard,
} from '../upload/content.upload';
import * as contentController from '../controller/content.controller';

const router = Router({ mergeParams: true }); // inherits :courseId from parent router

// ── Access-gated reads (IDOR enforced in service layer) ───────────────────────
router.get('/', authenticate, contentController.getCourseContents);
router.get('/:id', authenticate, contentController.getContentById);

// ── Admin writes ──────────────────────────────────────────────────────────────
router.post(
  '/',
  authenticate,
  authorize('admin'),
  uploadRateLimiter,        // 10 uploads/hr per IP
  concurrencyGuard,         // max 3 simultaneous in-flight uploads
  uploadContent.single('file'),
  validate(uploadContentSchema),
  contentController.addContent,
);
router.patch(
  '/:id',
  authenticate,
  authorize('admin'),
  validate(updateContentSchema),
  contentController.updateContent,
);
router.delete('/:id', authenticate, authorize('admin'), contentController.deleteContent);

export default router;