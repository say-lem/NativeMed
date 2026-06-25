import { Router } from 'express';
import { authenticate } from '../../../shared/middleware/authenticate';
import { validate } from '../../../shared/middleware/validate';
import {
  createCheckoutSchema,
  billingPortalSchema,
} from '../schema/payments.schema';
import * as paymentsController from '../controller/payments.controller';

const router = Router();

router.get('/plans', paymentsController.getPlans);

router.post(
  '/checkout',
  authenticate,
  validate(createCheckoutSchema),
  paymentsController.createCheckout,
);

router.post(
  '/billing-portal',
  authenticate,
  validate(billingPortalSchema),
  paymentsController.createBillingPortal,
);

router.get('/me', authenticate, paymentsController.getMyPayments);

export default router;
