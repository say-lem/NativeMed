import { Request, Response } from 'express';
import { asyncHandler } from '../../../shared/middleware/asyncHandler';
import { ApiResponse } from '../../../shared/utils/apiResponse';
import { AuthRequest } from '../../../shared/types';
import * as liveCoursesService from '../service/liveCourses.service';
import { LiveCourseFilterInput } from '../schema/liveCourses.schema';

const getSingleParam = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? value[0] : (value ?? '');

// ── Public ────────────────────────────────────────────────────────────────────

export const getAllPublished = asyncHandler(async (_req: Request, res: Response) => {
  const courses = await liveCoursesService.getAllPublishedLiveCourses();
  return ApiResponse.success(res, 'Live courses fetched', courses);
});

export const getLiveCourseById = asyncHandler(async (req: Request, res: Response) => {
  const course = await liveCoursesService.getLiveCourseById(getSingleParam(req.params.id));
  return ApiResponse.success(res, 'Live course fetched', course);
});

// ── Admin ─────────────────────────────────────────────────────────────────────

export const getAllLiveCoursesAdmin = asyncHandler(async (req: Request, res: Response) => {
  const params = (res.locals.query ?? req.query) as LiveCourseFilterInput;
  const result = await liveCoursesService.getAllLiveCoursesAdmin(params);
  return ApiResponse.success(res, 'All live courses fetched', result);
});

export const getLiveCourseByIdAdmin = asyncHandler(async (req: Request, res: Response) => {
  const course = await liveCoursesService.getLiveCourseByIdAdmin(getSingleParam(req.params.id));
  return ApiResponse.success(res, 'Live course fetched', course);
});

export const createLiveCourse = asyncHandler(async (req: AuthRequest, res: Response) => {
  const course = await liveCoursesService.createLiveCourse(req.body, req.user!._id);
  return ApiResponse.created(res, 'Live course created', course);
});

export const updateLiveCourse = asyncHandler(async (req: Request, res: Response) => {
  const course = await liveCoursesService.updateLiveCourse(getSingleParam(req.params.id), req.body);
  return ApiResponse.success(res, 'Live course updated', course);
});

export const deleteLiveCourse = asyncHandler(async (req: Request, res: Response) => {
  await liveCoursesService.deleteLiveCourse(getSingleParam(req.params.id));
  return ApiResponse.success(res, 'Live course deleted');
});

export const togglePublish = asyncHandler(async (req: Request, res: Response) => {
  const course = await liveCoursesService.togglePublish(getSingleParam(req.params.id));
  return ApiResponse.success(
    res,
    `Live course ${course.isPublished ? 'published' : 'unpublished'}`,
    course,
  );
});

export const pausePayments = asyncHandler(async (req: Request, res: Response) => {
  const course = await liveCoursesService.setLiveCoursePaymentsPaused(getSingleParam(req.params.id), true);
  return ApiResponse.success(res, 'Payments paused for this live course', course);
});

export const resumePayments = asyncHandler(async (req: Request, res: Response) => {
  const course = await liveCoursesService.setLiveCoursePaymentsPaused(getSingleParam(req.params.id), false);
  return ApiResponse.success(res, 'Payments resumed for this live course', course);
});

export const uploadThumbnail = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) {
    return ApiResponse.error(res, 'No image file uploaded', 400);
  }
  const course = await liveCoursesService.updateLiveCourseThumbnail(
    getSingleParam(req.params.id),
    req.file,
  );
  return ApiResponse.success(res, 'Thumbnail updated', { thumbnailUrl: course.thumbnailUrl });
});

export const uploadTocPdf = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) {
    return ApiResponse.error(res, 'No PDF file uploaded', 400);
  }
  const course = await liveCoursesService.updateLiveCourseTocPdf(
    getSingleParam(req.params.id),
    req.file,
  );
  return ApiResponse.success(res, 'Table of contents PDF updated', { tocPdfUrl: course.tocPdfUrl });
});

export const endLiveCourse = asyncHandler(async (req: Request, res: Response) => {
  await liveCoursesService.endLiveCourse(getSingleParam(req.params.id));
  return ApiResponse.success(res, 'Live course ended — all enrollments revoked.');
});

export const getEnrollmentsForCourse = asyncHandler(async (req: Request, res: Response) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;
  const result = await liveCoursesService.getEnrollmentsForCourse(
    getSingleParam(req.params.id),
    page,
    limit,
  );
  return ApiResponse.success(res, 'Live course enrollments fetched', result);
});

export const manualEnroll = asyncHandler(async (req: AuthRequest, res: Response) => {
  const enrollment = await liveCoursesService.manualEnroll(
    getSingleParam(req.body.userId),
    getSingleParam(req.params.id),
    req.user!._id,
  );
  return ApiResponse.created(
    res,
    'User enrolled successfully. Drive access granted if course has a folder configured.',
    enrollment,
  );
});

export const revokeEnrollment = asyncHandler(async (req: Request, res: Response) => {
  await liveCoursesService.revokeEnrollment(getSingleParam(req.body.userId), getSingleParam(req.params.id));
  return ApiResponse.success(res, 'Enrollment revoked and Drive access removed.');
});

export const restoreEnrollment = asyncHandler(async (req: Request, res: Response) => {
  const enrollment = await liveCoursesService.restoreEnrollment(getSingleParam(req.params.enrollmentId));
  return ApiResponse.success(res, 'Enrollment restored and Drive access re-granted.', enrollment);
});

// ── Enrolled users ────────────────────────────────────────────────────────────

export const purchaseLiveCourse = asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await liveCoursesService.purchaseLiveCourse(
    req.user!._id,
    getSingleParam(req.params.id),
    req.body,
  );
  return ApiResponse.success(res, 'Checkout session created', result);
});

export const checkEnrollment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await liveCoursesService.checkEnrollment(
    req.user!._id,
    getSingleParam(req.params.id),
  );
  return ApiResponse.success(res, 'Enrollment status fetched', result);
});

export const getMyLiveCourseEnrollments = asyncHandler(async (req: AuthRequest, res: Response) => {
  const enrollments = await liveCoursesService.getMyLiveCourseEnrollments(req.user!._id);
  return ApiResponse.success(res, 'Live course enrollments fetched', enrollments);
});
