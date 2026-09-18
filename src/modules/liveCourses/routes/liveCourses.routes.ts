import { Router } from 'express';
import { authenticate } from '../../../shared/middleware/authenticate';
import { authorize } from '../../../shared/middleware/authorize';
import { validate } from '../../../shared/middleware/validate';
import {
  createLiveCourseSchema,
  updateLiveCourseSchema,
  liveCourseFilterSchema,
  liveCourseIdSchema,
  purchaseLiveCourseSchema,
  manualEnrollLiveCourseSchema,
  revokeLiveCourseEnrollmentSchema,
} from '../schema/liveCourses.schema';
import { uploadCourseThumbnail } from '../../courses/upload/courses.upload';
import * as liveCoursesController from '../controller/liveCourses.controller';

const router = Router();

// ── Public ────────────────────────────────────────────────────────────────────
router.get('/', liveCoursesController.getAllPublished);

// ── Admin reads (before /:id so /admin/* is not captured as an id) ──────────
router.get(
  '/admin/all',
  authenticate,
  authorize('admin'),
  validate(liveCourseFilterSchema, 'query'),
  liveCoursesController.getAllLiveCoursesAdmin,
);
router.get(
  '/admin/:id',
  authenticate,
  authorize('admin'),
  validate(liveCourseIdSchema, 'params'),
  liveCoursesController.getLiveCourseByIdAdmin,
);

// ── Enrolled users ────────────────────────────────────────────────────────────
router.get('/me/enrollments', authenticate, liveCoursesController.getMyLiveCourseEnrollments);

router.get('/:id', liveCoursesController.getLiveCourseById);
router.get('/:id/check', authenticate, liveCoursesController.checkEnrollment);

router.post(
  '/:id/purchase',
  authenticate,
  validate(purchaseLiveCourseSchema),
  liveCoursesController.purchaseLiveCourse,
);

// ── Admin only ────────────────────────────────────────────────────────────────
router.post(
  '/',
  authenticate,
  authorize('admin'),
  validate(createLiveCourseSchema),
  liveCoursesController.createLiveCourse,
);

router.patch(
  '/:id',
  authenticate,
  authorize('admin'),
  validate(updateLiveCourseSchema),
  liveCoursesController.updateLiveCourse,
);

// Thumbnail is a separate endpoint from the main PATCH so it can use multer
// middleware without interfering with the JSON body parser used above.
router.patch(
  '/:id/thumbnail',
  authenticate,
  authorize('admin'),
  uploadCourseThumbnail.single('thumbnail'),
  liveCoursesController.uploadThumbnail,
);

router.patch('/:id/publish', authenticate, authorize('admin'), liveCoursesController.togglePublish);

// Pause/resume new purchases without touching visibility — course stays listed
router.patch('/:id/pause-payments', authenticate, authorize('admin'), liveCoursesController.pausePayments);
router.patch('/:id/resume-payments', authenticate, authorize('admin'), liveCoursesController.resumePayments);

// Ends the course — revokes every active enrollment's Drive access
router.post('/:id/end', authenticate, authorize('admin'), liveCoursesController.endLiveCourse);

router.get('/:id/enrollments', authenticate, authorize('admin'), liveCoursesController.getEnrollmentsForCourse);

router.post(
  '/:id/enroll',
  authenticate,
  authorize('admin'),
  validate(manualEnrollLiveCourseSchema),
  liveCoursesController.manualEnroll,
);
router.post(
  '/:id/revoke',
  authenticate,
  authorize('admin'),
  validate(revokeLiveCourseEnrollmentSchema),
  liveCoursesController.revokeEnrollment,
);
router.patch(
  '/enrollments/:enrollmentId/restore',
  authenticate,
  authorize('admin'),
  liveCoursesController.restoreEnrollment,
);

router.delete('/:id', authenticate, authorize('admin'), liveCoursesController.deleteLiveCourse);

export default router;
