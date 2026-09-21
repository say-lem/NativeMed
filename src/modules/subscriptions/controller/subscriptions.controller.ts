import { Response } from 'express';
import { Types } from 'mongoose';
import { asyncHandler } from '../../../shared/middleware/asyncHandler';
import { ApiResponse } from '../../../shared/utils/apiResponse';
import { AuthRequest } from '../../../shared/types';
import {
  ManualGrantCaseBankInput,
  RevokeCaseBankInput,
  RestoreCaseBankInput,
} from '../schema/subscriptions.schema';
import * as subscriptionsService from '../service/subscriptions.service';
import * as paymentsService from '../../payments/service/payments.service';

const getSingleParam = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? value[0] : (value ?? '');

export const getMySubscriptions = asyncHandler(async (req: AuthRequest, res: Response) => {
  const subscriptions = await subscriptionsService.getMySubscriptions(req.user!._id);
  return ApiResponse.success(res, 'Subscriptions fetched', subscriptions);
});

export const getCaseBankStatus = asyncHandler(async (req: AuthRequest, res: Response) => {
  const status = await subscriptionsService.getCaseBankStatus(req.user!._id);
  return ApiResponse.success(res, 'Case Bank subscription status fetched', status);
});

export const getCourseSubscriptionStatus = asyncHandler(async (req: AuthRequest, res: Response) => {
  const status = await subscriptionsService.getCourseSubscriptionStatus(
    req.user!._id,
    getSingleParam(req.params.courseId),
  );
  return ApiResponse.success(res, 'Course subscription status fetched', status);
});

export const getPlans = asyncHandler(async (_req, res: Response) => {
  const plans = await subscriptionsService.getAvailablePlans();
  return ApiResponse.success(res, 'Plans fetched', plans);
});

export const getSubscribers = asyncHandler(async (_req, res: Response) => {
  const subscribers = await subscriptionsService.getAllSubscribers();
  return ApiResponse.success(res, 'Subscribers fetched', subscribers);
});

// ── Admin — Case Bank management ────────────────────────────────────────────

export const manualGrantCaseBank = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { userId, durationDays } = req.body as ManualGrantCaseBankInput;
  const subscription = await subscriptionsService.manualGrantCaseBank(
    new Types.ObjectId(userId),
    req.user!._id,
    durationDays,
  );
  return ApiResponse.created(res, 'Case Bank access granted', subscription);
});

export const revokeCaseBankAccess = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { userId } = req.body as RevokeCaseBankInput;
  await subscriptionsService.revokeCaseBankAccess(userId);
  return ApiResponse.success(res, 'Case Bank access revoked');
});

export const restoreCaseBankAccess = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { userId, durationDays } = req.body as RestoreCaseBankInput;
  const subscription = await subscriptionsService.restoreCaseBankAccess(userId, durationDays);
  return ApiResponse.success(res, 'Case Bank access restored', subscription);
});

export const pauseCaseBankPayments = asyncHandler(async (_req, res: Response) => {
  const settings = await subscriptionsService.setCaseBankPaymentsPaused(true);
  return ApiResponse.success(res, 'Payments paused for Case Bank', settings);
});

export const resumeCaseBankPayments = asyncHandler(async (_req, res: Response) => {
  const settings = await subscriptionsService.setCaseBankPaymentsPaused(false);
  return ApiResponse.success(res, 'Payments resumed for Case Bank', settings);
});

// ── Self-service — cancel / resume / change plan ────────────────────────────

export const cancelCaseBankSubscription = asyncHandler(async (req: AuthRequest, res: Response) => {
  await subscriptionsService.scheduleCancellation(req.user!._id, 'case_bank');
  const status = await subscriptionsService.getCaseBankStatus(req.user!._id);
  return ApiResponse.success(res, 'Subscription will cancel at the end of the billing period', status);
});

export const resumeCaseBankSubscription = asyncHandler(async (req: AuthRequest, res: Response) => {
  await subscriptionsService.resumeCancellation(req.user!._id, 'case_bank');
  const status = await subscriptionsService.getCaseBankStatus(req.user!._id);
  return ApiResponse.success(res, 'Scheduled cancellation reversed', status);
});

export const cancelCourseSubscription = asyncHandler(async (req: AuthRequest, res: Response) => {
  const courseId = getSingleParam(req.params.courseId);
  await subscriptionsService.scheduleCancellation(req.user!._id, 'course', courseId);
  const status = await subscriptionsService.getCourseSubscriptionStatus(req.user!._id, courseId);
  return ApiResponse.success(res, 'Subscription will cancel at the end of the billing period', status);
});

export const resumeCourseSubscription = asyncHandler(async (req: AuthRequest, res: Response) => {
  const courseId = getSingleParam(req.params.courseId);
  await subscriptionsService.resumeCancellation(req.user!._id, 'course', courseId);
  const status = await subscriptionsService.getCourseSubscriptionStatus(req.user!._id, courseId);
  return ApiResponse.success(res, 'Scheduled cancellation reversed', status);
});

export const changeCoursePlan = asyncHandler(async (req: AuthRequest, res: Response) => {
  const courseId = getSingleParam(req.params.courseId);
  const status = await paymentsService.changeCoursePlan({
    userId: req.user!._id,
    courseId,
    newInterval: req.body.interval,
  });
  return ApiResponse.success(res, 'Subscription plan updated', status);
});
