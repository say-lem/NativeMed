import { Router } from 'express';
import { authenticate } from '../../../shared/middleware/authenticate';
import { authorize } from '../../../shared/middleware/authorize';
import { validate } from '../../../shared/middleware/validate';
import {
  revokeEnrollmentSchema,
  manualEnrollSchema,
} from '../schema/enrollments.schema';
import * as enrollmentsController from '../controller/enrollments.controller';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// User routes
// ─────────────────────────────────────────────────────────────────────────────

// All courses the logged-in user is actively enrolled in
router.get('/me', authenticate, enrollmentsController.getMyEnrollments);

// Quick enrollment check for a specific course — used by the frontend to
// show/hide course content and the "Enroll" button
router.get(
  '/check/:courseId',
  authenticate,
  enrollmentsController.checkEnrollment,
);

// ─────────────────────────────────────────────────────────────────────────────
// Admin routes
// ─────────────────────────────────────────────────────────────────────────────

// All enrollments across the platform (paginated)
router.get(
  '/',
  authenticate,
  authorize('admin'),
  enrollmentsController.getAllEnrollments,
);

// All enrollments for a specific course — useful for the admin course detail page
router.get(
  '/course/:courseId',
  authenticate,
  authorize('admin'),
  enrollmentsController.getEnrollmentsByCourse,
);

// All course enrollments for a specific user — useful for the admin user detail page
router.get(
  '/user/:userId',
  authenticate,
  authorize('admin'),
  enrollmentsController.getEnrollmentsByUser,
);

// Manually grant access — comped course enrollment or Case Bank, by `type` (no payment required)
router.post(
  '/manual',
  authenticate,
  authorize('admin'),
  validate(manualEnrollSchema),
  enrollmentsController.manualEnroll,
);

// Revoke a user's enrollment and remove their Drive access
router.post(
  '/revoke',
  authenticate,
  authorize('admin'),
  validate(revokeEnrollmentSchema),
  enrollmentsController.revokeEnrollment,
);

// Restore a previously revoked enrollment and re-grant Drive access
router.patch(
  '/:enrollmentId/restore',
  authenticate,
  authorize('admin'),
  enrollmentsController.restoreEnrollment,
);

export default router;