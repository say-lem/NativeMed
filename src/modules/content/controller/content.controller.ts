import { Response } from 'express';
import { asyncHandler } from '../../../shared/middleware/asyncHandler';
import { ApiResponse } from '../../../shared/utils/apiResponse';
import { AuthRequest, UserRole } from '../../../shared/types';
import * as contentService from '../service/content.service';

const getSingleParam = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? value[0] : (value ?? '');

// ── Enrolled users ─────────────────────────────────────────────────────────────

export const getCourseContents = asyncHandler(async (req: AuthRequest, res: Response) => {
  const contents = await contentService.getCourseContents(
    getSingleParam(req.params.courseId),
    req.user!._id,
    req.user!.role as UserRole,
  );
  return ApiResponse.success(res, 'Contents fetched', contents);
});

export const getContentById = asyncHandler(async (req: AuthRequest, res: Response) => {
  const content = await contentService.getContentById(
    getSingleParam(req.params.id),
    req.user!._id,
    req.user!.role as UserRole,
  );
  return ApiResponse.success(res, 'Content fetched', content);
});

// ── Admin ──────────────────────────────────────────────────────────────────────

export const uploadPdf = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.file) return ApiResponse.error(res, 'No PDF file uploaded', 400);
  const content = await contentService.uploadPdf(getSingleParam(req.params.courseId), req.body, req.file);
  return ApiResponse.created(res, 'PDF uploaded', content);
});

export const addDriveLink = asyncHandler(async (req: AuthRequest, res: Response) => {
  const content = await contentService.addDriveLink(getSingleParam(req.params.courseId), req.body);
  return ApiResponse.created(res, 'Drive link added', content);
});

export const updateContent = asyncHandler(async (req: AuthRequest, res: Response) => {
  const content = await contentService.updateContent(getSingleParam(req.params.id), req.body);
  return ApiResponse.success(res, 'Content updated', content);
});

export const deleteContent = asyncHandler(async (req: AuthRequest, res: Response) => {
  await contentService.deleteContent(getSingleParam(req.params.id));
  return ApiResponse.success(res, 'Content deleted');
});