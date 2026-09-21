import { Router } from 'express';
import { authenticate } from '../../../shared/middleware/authenticate';
import { authorize } from '../../../shared/middleware/authorize';
import { validate } from '../../../shared/middleware/validate';
import {
  courseIdParamsSchema,
  changePlanSchema,
  manualGrantCaseBankSchema,
  revokeCaseBankSchema,
  restoreCaseBankSchema,
} from '../schema/subscriptions.schema';
import * as subscriptionsController from '../controller/subscriptions.controller';

const router = Router();

router.get('/plans', subscriptionsController.getPlans);

router.get('/me', authenticate, subscriptionsController.getMySubscriptions);

router.get(
  '/subscribers',
  authenticate,
  authorize('admin'),
  subscriptionsController.getSubscribers,
);

// ── Admin — Case Bank management ────────────────────────────────────────────

router.post(
  '/case-bank/enroll',
  authenticate,
  authorize('admin'),
  validate(manualGrantCaseBankSchema),
  subscriptionsController.manualGrantCaseBank,
);

router.post(
  '/case-bank/revoke',
  authenticate,
  authorize('admin'),
  validate(revokeCaseBankSchema),
  subscriptionsController.revokeCaseBankAccess,
);

router.patch(
  '/case-bank/restore',
  authenticate,
  authorize('admin'),
  validate(restoreCaseBankSchema),
  subscriptionsController.restoreCaseBankAccess,
);

router.patch(
  '/case-bank/pause-payments',
  authenticate,
  authorize('admin'),
  subscriptionsController.pauseCaseBankPayments,
);

router.patch(
  '/case-bank/resume-payments',
  authenticate,
  authorize('admin'),
  subscriptionsController.resumeCaseBankPayments,
);

router.get('/case-bank/status', authenticate, subscriptionsController.getCaseBankStatus);

router.get(
  '/course/:courseId/status',
  authenticate,
  validate(courseIdParamsSchema, 'params'),
  subscriptionsController.getCourseSubscriptionStatus,
);

// ── Self-service — cancel / resume / change plan ────────────────────────────

router.post(
  '/case-bank/cancel',
  authenticate,
  subscriptionsController.cancelCaseBankSubscription,
);

router.post(
  '/case-bank/resume',
  authenticate,
  subscriptionsController.resumeCaseBankSubscription,
);

router.post(
  '/course/:courseId/cancel',
  authenticate,
  validate(courseIdParamsSchema, 'params'),
  subscriptionsController.cancelCourseSubscription,
);

router.post(
  '/course/:courseId/resume',
  authenticate,
  validate(courseIdParamsSchema, 'params'),
  subscriptionsController.resumeCourseSubscription,
);

router.post(
  '/course/:courseId/change-plan',
  authenticate,
  validate(courseIdParamsSchema, 'params'),
  validate(changePlanSchema),
  subscriptionsController.changeCoursePlan,
);

export default router;
