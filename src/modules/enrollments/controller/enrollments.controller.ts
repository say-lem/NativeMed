import { Request, Response } from 'express';
import { asyncHandler } from '../../../shared/middleware/asyncHandler';
import { ApiResponse } from '../../../shared/utils/apiResponse';
import { AuthRequest } from '../../../shared/types';
import * as enrollmentsService from '../service/enrollments.service';



const getSingleParam = (value: string | string[] | undefined): string =>
    Array.isArray(value) ? value[0] : (value ?? '');
// ─────────────────────────────────────────────────────────────────────────────
// User controllers
// ─────────────────────────────────────────────────────────────────────────────

export const getMyEnrollments = asyncHandler(async (req: AuthRequest, res: Response) => {
  const enrollments = await enrollmentsService.getMyEnrollments(req.user!._id);
  return ApiResponse.success(res, 'Enrollments fetched', enrollments);
});

export const checkEnrollment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await enrollmentsService.checkEnrollment(
    req.user!._id,
    getSingleParam(req.params.courseId),
  );
  return ApiResponse.success(res, 'Enrollment status fetched', result);
});

// ─────────────────────────────────────────────────────────────────────────────
// Admin controllers
// ─────────────────────────────────────────────────────────────────────────────

export const getAllEnrollments = asyncHandler(async (req: Request, res: Response) => {
  const page  = Number(req.query.page)  || 1;
  const limit = Number(req.query.limit) || 20;
  const result = await enrollmentsService.getAllEnrollments(page, limit);
  return ApiResponse.success(res, 'All enrollments fetched', result);
});

export const getEnrollmentsByCourse = asyncHandler(async (req: Request, res: Response) => {
  const page  = Number(req.query.page)  || 1;
  const limit = Number(req.query.limit) || 20;
  const result = await enrollmentsService.getEnrollmentsByCourse(
    getSingleParam(req.params.courseId),
    page,
    limit,
  );
  return ApiResponse.success(res, 'Course enrollments fetched', result);
});

export const getEnrollmentsByUser = asyncHandler(async (req: Request, res: Response) => {
  const enrollments = await enrollmentsService.getEnrollmentsByUser(getSingleParam(req.params.userId));
  return ApiResponse.success(res, 'User enrollments fetched', enrollments);
});

export const manualEnroll = asyncHandler(async (req: AuthRequest, res: Response) => {
  const enrollment = await enrollmentsService.manualEnroll(
    getSingleParam(req.body.userId),
    req.body.courseId,
    req.user!._id,
    req.body.accessTier,
  );
  return ApiResponse.created(
    res,
    'User enrolled successfully. Drive access granted if course has a folder configured.',
    enrollment,
  );
});

export const revokeEnrollment = asyncHandler(async (req: Request, res: Response) => {
  await enrollmentsService.revokeEnrollment(getSingleParam(req.body.userId), getSingleParam(req.body.courseId));
  return ApiResponse.success(res, 'Enrollment revoked and Drive access removed.');
});

export const restoreEnrollment = asyncHandler(async (req: Request, res: Response) => {
  const enrollment = await enrollmentsService.restoreEnrollment(
    getSingleParam(req.params.enrollmentId),
  );
  return ApiResponse.success(
    res,
    'Enrollment restored and Drive access re-granted.',
    enrollment,
  );
});