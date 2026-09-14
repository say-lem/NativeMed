import { Request, Response } from 'express';
import { asyncHandler } from '../../../shared/middleware/asyncHandler';
import { ApiResponse } from '../../../shared/utils/apiResponse';
import { UpdateCaseBankOverviewInput } from '../schema/caseBankOverview.schema';
import * as caseBankOverviewService from '../service/caseBankOverview.service';

export const getCaseBankOverview = asyncHandler(async (_req: Request, res: Response) => {
  const overview = await caseBankOverviewService.getCaseBankOverview();
  return ApiResponse.success(res, 'Case bank overview fetched', overview);
});

export const updateCaseBankOverview = asyncHandler(async (req: Request, res: Response) => {
  const input = req.body as UpdateCaseBankOverviewInput;
  const overview = await caseBankOverviewService.updateCaseBankOverview(input);
  return ApiResponse.success(res, 'Case bank overview updated', overview);
});

export const updateCaseBankOverviewImage = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) {
    return ApiResponse.error(res, 'No image file uploaded', 400);
  }
  const overview = await caseBankOverviewService.updateCaseBankOverviewImage(req.file);
  return ApiResponse.success(res, 'Case bank overview image updated', { imageUrl: overview.imageUrl });
});
