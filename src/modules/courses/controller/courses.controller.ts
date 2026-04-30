import { Request, Response } from 'express';
import { asyncHandler } from '../../../shared/middleware/asyncHandler';
import { ApiResponse } from '../../../shared/utils/apiResponse';
import { AuthRequest } from '../../../shared/types';
import * as coursesService from '../service/courses.service';



const getSingleParam = (value: string | string[] | undefined): string =>
    Array.isArray(value) ? value[0] : (value ?? '');

// ── Public ────────────────────────────────────────────────────────────────────

export const getAllPublished = asyncHandler(async (_req: Request, res: Response) => {
  const courses = await coursesService.getAllPublished();
  return ApiResponse.success(res, 'Courses fetched', courses);
});

export const getCourseById = asyncHandler(async (req: Request, res: Response) => {
  const course = await coursesService.getCourseById(getSingleParam(req.params.id));
  return ApiResponse.success(res, 'Course fetched', course);
});

// ── Admin ─────────────────────────────────────────────────────────────────────

export const createCourse = asyncHandler(async (req: AuthRequest, res: Response) => {
  const course = await coursesService.createCourse(req.body, req.user!._id);
  return ApiResponse.created(res, 'Course created', course);
});

export const updateCourse = asyncHandler(async (req: Request, res: Response) => {
  const course = await coursesService.updateCourse(getSingleParam(req.params.id), req.body);
  return ApiResponse.success(res, 'Course updated', course);
});

export const deleteCourse = asyncHandler(async (req: Request, res: Response) => {
  await coursesService.deleteCourse(getSingleParam(req.params.id));
  return ApiResponse.success(res, 'Course deleted');
});

export const togglePublish = asyncHandler(async (req: Request, res: Response) => {
  const course = await coursesService.togglePublish(getSingleParam(req.params.id));
  return ApiResponse.success(
    res,
    `Course ${course.isPublished ? 'published' : 'unpublished'}`,
    course,
  );
});

export const uploadThumbnail = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) {
    return ApiResponse.error(res, 'No image file uploaded', 400);
  }
  const course = await coursesService.updateCourseThumbnail(getSingleParam(req.params.id), req.file);
  return ApiResponse.success(res, 'Thumbnail updated', {
    thumbnailUrl: course.thumbnailUrl,
    thumbnailPublicId: course.thumbnailPublicId,
  });
});