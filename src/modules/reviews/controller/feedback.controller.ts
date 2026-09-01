import { Request, Response } from 'express';
import { asyncHandler } from '../../../shared/middleware/asyncHandler';
import { ApiResponse } from '../../../shared/utils/apiResponse';
import { CreateFeedbackInput } from '../schema/feedback.schema';
import * as feedbackService from '../service/feedback.service';

const getSingleParam = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? value[0] : (value ?? '');

// Public — submitted straight to the admin inbox, never shown to other users.
export const submitFeedback = asyncHandler(async (req: Request, res: Response) => {
  const input = req.body as CreateFeedbackInput;
  await feedbackService.submitFeedback(input);
  return ApiResponse.created(res, 'Thank you for your feedback');
});

// Admin only
export const getAllFeedback = asyncHandler(async (req: Request, res: Response) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;
  const result = await feedbackService.getAllFeedback(page, limit);
  return ApiResponse.success(res, 'Feedback fetched', result);
});

export const deleteFeedback = asyncHandler(async (req: Request, res: Response) => {
  await feedbackService.deleteFeedback(getSingleParam(req.params.feedbackId));
  return ApiResponse.success(res, 'Feedback deleted');
});
