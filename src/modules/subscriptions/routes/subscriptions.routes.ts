import { Router } from 'express';
import { authenticate } from '../../../shared/middleware/authenticate';
import { authorize } from '../../../shared/middleware/authorize';
import { validate } from '../../../shared/middleware/validate';
import { courseIdParamsSchema } from '../schema/subscriptions.schema';
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

router.get('/case-bank/status', authenticate, subscriptionsController.getCaseBankStatus);

router.get(
  '/course/:courseId/status',
  authenticate,
  validate(courseIdParamsSchema, 'params'),
  subscriptionsController.getCourseSubscriptionStatus,
);

export default router;
