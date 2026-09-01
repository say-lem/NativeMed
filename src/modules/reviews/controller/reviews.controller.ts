import { Request, Response } from 'express';
import { asyncHandler } from '../../../shared/middleware/asyncHandler';
import { ApiResponse } from '../../../shared/utils/apiResponse';
import { AppError } from '../../../shared/utils/appError';
import { AuthRequest } from '../../../shared/types';
import { CreateReviewInput, UpdateReviewInput } from '../schema/reviews.schema';
import { ReviewStatus } from '../model/reviews.model';
import * as reviewsService from '../service/reviews.service';

const getSingleParam = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? value[0] : (value ?? '');

const REVIEW_STATUSES: ReviewStatus[] = ['pending', 'approved', 'revoked'];

// ─────────────────────────────────────────────────────────────────────────────
// Public
// ─────────────────────────────────────────────────────────────────────────────

export const submitReview = asyncHandler(async (req: Request, res: Response) => {
  const input = req.body as CreateReviewInput;
  const review = await reviewsService.createReview(input);
  return ApiResponse.created(res, 'Review submitted and awaiting approval', review);
});

export const getApprovedReviews = asyncHandler(async (req: Request, res: Response) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;
  const result = await reviewsService.getApprovedReviews(page, limit);
  return ApiResponse.success(res, 'Reviews fetched', result);
});

// ─────────────────────────────────────────────────────────────────────────────
// Admin
// ─────────────────────────────────────────────────────────────────────────────

export const getAllReviews = asyncHandler(async (req: Request, res: Response) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;

  const statusParam = getSingleParam(req.query.status as string | string[] | undefined);
  if (statusParam && !REVIEW_STATUSES.includes(statusParam as ReviewStatus)) {
    throw new AppError('Invalid status filter', 422);
  }
  const status = statusParam ? (statusParam as ReviewStatus) : undefined;

  const result = await reviewsService.getAllReviews(status, page, limit);
  return ApiResponse.success(res, 'Reviews fetched', result);
});

export const updateReview = asyncHandler(async (req: Request, res: Response) => {
  const input = req.body as UpdateReviewInput;
  const review = await reviewsService.updateReview(getSingleParam(req.params.reviewId), input);
  return ApiResponse.success(res, 'Review updated', review);
});

export const approveReview = asyncHandler(async (req: AuthRequest, res: Response) => {
  const review = await reviewsService.approveReview(getSingleParam(req.params.reviewId), req.user!._id);
  return ApiResponse.success(res, 'Review approved', review);
});

export const revokeReview = asyncHandler(async (req: AuthRequest, res: Response) => {
  const review = await reviewsService.revokeReview(getSingleParam(req.params.reviewId), req.user!._id);
  return ApiResponse.success(res, 'Review revoked', review);
});

export const deleteReview = asyncHandler(async (req: Request, res: Response) => {
  await reviewsService.deleteReview(getSingleParam(req.params.reviewId));
  return ApiResponse.success(res, 'Review deleted');
});
