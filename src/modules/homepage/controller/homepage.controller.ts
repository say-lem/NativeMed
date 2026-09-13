import { Request, Response } from 'express';
import { asyncHandler } from '../../../shared/middleware/asyncHandler';
import { ApiResponse } from '../../../shared/utils/apiResponse';
import {
  UpdateHomepageStatsInput,
  CreateYoutubeLinkInput,
  UpdateYoutubeLinkInput,
  UpdateTermsAndConditionsInput,
  UpdateLegalDisclaimerInput,
} from '../schema/homepage.schema';
import * as homepageService from '../service/homepage.service';

const getSingleParam = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? value[0] : (value ?? '');

// ─────────────────────────────────────────────────────────────────────────────
// Public
// ─────────────────────────────────────────────────────────────────────────────

export const getHomepageData = asyncHandler(async (_req: Request, res: Response) => {
  const data = await homepageService.getHomepageData();
  return ApiResponse.success(res, 'Homepage data fetched', data);
});

export const getTermsAndConditions = asyncHandler(async (_req: Request, res: Response) => {
  const data = await homepageService.getTermsAndConditions();
  return ApiResponse.success(res, 'Terms and conditions fetched', data);
});

export const getLegalDisclaimer = asyncHandler(async (_req: Request, res: Response) => {
  const data = await homepageService.getLegalDisclaimer();
  return ApiResponse.success(res, 'Legal disclaimer fetched', data);
});

// ─────────────────────────────────────────────────────────────────────────────
// Admin
// ─────────────────────────────────────────────────────────────────────────────

export const updateHomepageStats = asyncHandler(async (req: Request, res: Response) => {
  const input = req.body as UpdateHomepageStatsInput;
  const settings = await homepageService.updateHomepageStats(input);
  return ApiResponse.success(res, 'Homepage stats updated', settings);
});

export const addYoutubeLink = asyncHandler(async (req: Request, res: Response) => {
  const input = req.body as CreateYoutubeLinkInput;
  const settings = await homepageService.addYoutubeLink(input);
  return ApiResponse.created(res, 'YouTube link added', settings);
});

export const updateYoutubeLink = asyncHandler(async (req: Request, res: Response) => {
  const input = req.body as UpdateYoutubeLinkInput;
  const settings = await homepageService.updateYoutubeLink(getSingleParam(req.params.linkId), input);
  return ApiResponse.success(res, 'YouTube link updated', settings);
});

export const deleteYoutubeLink = asyncHandler(async (req: Request, res: Response) => {
  const settings = await homepageService.deleteYoutubeLink(getSingleParam(req.params.linkId));
  return ApiResponse.success(res, 'YouTube link deleted', settings);
});

export const updateTermsAndConditions = asyncHandler(async (req: Request, res: Response) => {
  const input = req.body as UpdateTermsAndConditionsInput;
  const data = await homepageService.updateTermsAndConditions(input);
  return ApiResponse.success(res, 'Terms and conditions updated', data);
});

export const updateLegalDisclaimer = asyncHandler(async (req: Request, res: Response) => {
  const input = req.body as UpdateLegalDisclaimerInput;
  const data = await homepageService.updateLegalDisclaimer(input);
  return ApiResponse.success(res, 'Legal disclaimer updated', data);
});
