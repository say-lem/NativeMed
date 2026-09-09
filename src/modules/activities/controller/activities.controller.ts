import { Request, Response } from 'express';
import { asyncHandler } from '../../../shared/middleware/asyncHandler';
import { ApiResponse } from '../../../shared/utils/apiResponse';
import { AuthRequest } from '../../../shared/types';
import { CreateActivityInput, UpdateActivityInput } from '../schema/activities.schema';
import * as activitiesService from '../service/activities.service';

const getSingleParam = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? value[0] : (value ?? '');

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

export const updateActivity = asyncHandler(async (req: Request, res: Response) => {
  const input = req.body as UpdateActivityInput;
  const activity = await activitiesService.updateActivity(getSingleParam(req.params.activityId), input);
  return ApiResponse.success(res, 'Activity updated', activity);
});

export const deleteActivity = asyncHandler(async (req: Request, res: Response) => {
  await activitiesService.deleteActivity(getSingleParam(req.params.activityId));
  return ApiResponse.success(res, 'Activity deleted');
});

export const getAdminActivities = asyncHandler(async (req: Request, res: Response) => {
  const result = await activitiesService.getAllActivities(Number(req.query.page) || 1, Number(req.query.limit) || 20, true);
  return ApiResponse.success(res, 'Activities fetched', result);
});

export const publishActivity = asyncHandler(async (req: Request, res: Response) => {
  const activity = await activitiesService.setActivityPublished(getSingleParam(req.params.activityId), true);
  return ApiResponse.success(res, 'Activity published', activity);
});

export const unpublishActivity = asyncHandler(async (req: Request, res: Response) => {
  const activity = await activitiesService.setActivityPublished(getSingleParam(req.params.activityId), false);
  return ApiResponse.success(res, 'Activity unpublished', activity);
});
