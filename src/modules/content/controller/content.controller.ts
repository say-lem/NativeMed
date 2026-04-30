import { Response } from 'express';
import { asyncHandler } from '../../../shared/middleware/asyncHandler';
import { ApiResponse } from '../../../shared/utils/apiResponse';
import { AuthRequest } from '../../../shared/types';
import * as contentService from '../service/content.service';

const getSingleParam = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? value[0] : (value ?? '');

// ─────────────────────────────────────────────────────────────────────────────
// User (enrolled) — access-gated reads
// Both handlers now receive user identity so the service can enforce
// the IDOR guard. authenticate middleware guarantees req.user is present.
// ─────────────────────────────────────────────────────────────────────────────

export const getCourseContents = asyncHandler(async (req: AuthRequest, res: Response) => {
  const contents = await contentService.getCourseContents(
    getSingleParam(req.params.courseId),
    req.user!._id,
    req.user!.role,
  );
  return ApiResponse.success(res, 'Contents fetched', contents);
});

export const getContentById = asyncHandler(async (req: AuthRequest, res: Response) => {
  const content = await contentService.getContentById(
    getSingleParam(req.params.id),
    req.user!._id,
    req.user!.role,
  );
  return ApiResponse.success(res, 'Content fetched', content);
});

// ─────────────────────────────────────────────────────────────────────────────
// Admin — write operations
// ─────────────────────────────────────────────────────────────────────────────

export const addContent = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.file) {
    return ApiResponse.error(res, 'No file uploaded', 400);
  }

  const content = await contentService.addContent(
    getSingleParam(req.params.courseId),
    req.body,
    req.file,
  );

  return ApiResponse.created(res, 'Content uploaded successfully', content);
});

export const updateContent = asyncHandler(async (req: AuthRequest, res: Response) => {
  const content = await contentService.updateContent(getSingleParam(req.params.id), req.body);
  return ApiResponse.success(res, 'Content updated', content);
});

export const deleteContent = asyncHandler(async (req: AuthRequest, res: Response) => {
  await contentService.deleteContent(getSingleParam(req.params.id));
  return ApiResponse.success(res, 'Content deleted');
});