import { Response } from 'express';
import { asyncHandler } from '../../../shared/middleware/asyncHandler';
import { ApiResponse } from '../../../shared/utils/apiResponse';
import { AuthRequest } from '../../../shared/types';
import * as paymentsService from '../service/payments.service';
import * as subscriptionsService from '../../subscriptions/service/subscriptions.service';
import { enqueueWebhookEvent, processWebhookEventNow } from '../service/webhookQueue.service';

export const getPlans = asyncHandler(async (_req, res: Response) => {
  const plans = await subscriptionsService.getAvailablePlans();
  return ApiResponse.success(res, 'Plans fetched', plans);
});

export const createCheckout = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await paymentsService.getCheckoutUser(req.user!._id);

  const session = await paymentsService.createCheckoutSession({
    userId: req.user!._id,
    email: user.email,
    type: req.body.type,
    interval: req.body.interval,
    courseId: req.body.courseId,
    successUrl: req.body.successUrl,
    cancelUrl: req.body.cancelUrl,
  });

  return ApiResponse.success(res, 'Checkout session created', session);
});

export const createBillingPortal = asyncHandler(async (req: AuthRequest, res: Response) => {
  const session = await paymentsService.createBillingPortalSession(
    req.user!._id,
    req.body.returnUrl,
  );
  return ApiResponse.success(res, 'Billing portal session created', session);
});

export const getMyPayments = asyncHandler(async (req: AuthRequest, res: Response) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;
  const result = await paymentsService.getMyPayments(req.user!._id, page, limit);
  return ApiResponse.success(res, 'Payments fetched', result);
});

export const handleWebhook = asyncHandler(async (req, res: Response) => {
  const signature = req.headers['stripe-signature'];
  if (!signature || typeof signature !== 'string') {
    return ApiResponse.error(res, 'Missing Stripe signature', 400);
  }

  const event = paymentsService.constructWebhookEvent(req.body as Buffer, signature);
  const queued = await enqueueWebhookEvent(event);

  res.status(200).json({ received: true });

  processWebhookEventNow(queued._id);
});
