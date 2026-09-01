import { Request, Response } from 'express';
import { asyncHandler } from '../../../shared/middleware/asyncHandler';
import { ApiResponse } from '../../../shared/utils/apiResponse';
import { AuthRequest } from '../../../shared/types';
import { CreateActivityInput } from '../schema/activities.schema';
import * as activitiesService from '../service/activities.service';

export const createActivity = asyncHandler(async (req: AuthRequest, res: Response) => {
  const input = req.body as CreateActivityInput;
  const activity = await activitiesService.createActivity(input, req.user!._id);
  return ApiResponse.created(res, 'Activity posted', activity);
});

export const getAllActivities = asyncHandler(async (req: Request, res: Response) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;
  const result = await activitiesService.getAllActivities(page, limit);
  return ApiResponse.success(res, 'Activities fetched', result);
});
