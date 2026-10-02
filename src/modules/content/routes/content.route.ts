import { Router } from 'express';
import { authenticate } from '../../../shared/middleware/authenticate';
import { authorize } from '../../../shared/middleware/authorize';
import { validate } from '../../../shared/middleware/validate';
import {
  uploadPdfSchema,
  registerPdfSchema,
  addDriveLinkSchema,
  updateContentSchema,
} from '../schema/content.schema';
import {
  uploadPdf as uploadPdfMiddleware,
  uploadRateLimiter as uploadRateLimiterMiddleware,
  concurrencyGuard as concurrencyGuardMiddleware,
} from '../upload/content.upload';
import * as contentController from '../controller/content.controller';
import { ContentCourseType } from '../model/content.model';

// This router is mounted twice — once under /courses/:courseId/content
// ('Course') and once under /live-courses/:courseId/content ('LiveCourse') —
// so both course types share one content list, one upload flow, and one
// IDOR guard instead of duplicating the whole module.
export const createContentRouter = (courseType: ContentCourseType) => {
  const router = Router({ mergeParams: true }); // inherits :courseId from parent
  const controller = contentController.createContentController(courseType);

  // ── Admin writes (static paths before /:id) ───────────────────────────────

  // ── Admin: upload a PDF (Cloudinary) ──────────────────────────────────────
  router.post(
    '/upload-pdf',
    authenticate,
    authorize('admin'),
    uploadRateLimiterMiddleware,
    concurrencyGuardMiddleware,
    uploadPdfMiddleware.single('file'),
    validate(uploadPdfSchema),
    controller.uploadPdf,
  );

  // ── Admin: register a PDF already uploaded directly to Cloudinary ────────
  // (see uploads.route.ts) — the file never passes through this server.
  router.post(
    '/pdf-link',
    authenticate,
    authorize('admin'),
    validate(registerPdfSchema),
    controller.registerPdf,
  );

  // ── Admin: register a Google Drive video/audio link ───────────────────────
  // No file upload — admin pastes the Drive share link they created manually.
  router.post(
    '/drive-link',
    authenticate,
    authorize('admin'),
    validate(addDriveLinkSchema),
    controller.addDriveLink,
  );

  // ── Enrolled users (reads) ─────────────────────────────────────────────────
  router.get('/', authenticate, controller.getCourseContents);
  router.get('/:id', authenticate, contentController.getContentById);

  // ── Admin: update metadata / delete ───────────────────────────────────────
  router.patch('/:id', authenticate, authorize('admin'), validate(updateContentSchema), contentController.updateContent);
  router.delete('/:id', authenticate, authorize('admin'), contentController.deleteContent);

  return router;
};