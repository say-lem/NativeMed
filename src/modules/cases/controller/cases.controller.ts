import { Request, Response } from 'express';
import { asyncHandler } from '../../../shared/middleware/asyncHandler';
import { ApiResponse } from '../../../shared/utils/apiResponse';
import { AuthRequest } from '../../../shared/types';
import * as casesService from '../service/cases.service';
import { CaseFilterInput, caseFilterSchema } from '../schema/cases.schema';

// ─────────────────────────────────────────────────────────────────────────────
// Public / user controllers — published cases only
// ─────────────────────────────────────────────────────────────────────────────

export const getPublishedCases = asyncHandler(async (req: AuthRequest, res: Response) => {
  const params = (res.locals.query ?? req.query) as CaseFilterInput;
  const result = await casesService.getPublishedCases(params, req.user?._id, req.user?.role);
  return ApiResponse.success(res, 'Cases fetched', result);
});

export const getPublishedCaseById = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = (res.locals.params ?? req.params) as { id: string };
  const mockCase = await casesService.getPublishedCaseById(id, req.user?._id, req.user?.role);
  return ApiResponse.success(res, 'Case fetched', mockCase);
});

export const getPublishedSpecialties = asyncHandler(async (req: AuthRequest, res: Response) => {
  const specialties = await casesService.getPublishedSpecialties(req.user?._id, req.user?.role);
  return ApiResponse.success(res, 'Specialties fetched', specialties);
});

export const getCasesBySpecialty = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { specialty } = (res.locals.params ?? req.params) as { specialty: string };
    const params = (res.locals.query ?? req.query) as CaseFilterInput;
    const result = await casesService.getCasesBySpecialty(
      specialty,
      params,
      req.user?._id,
      req.user?.role,
    );
    return ApiResponse.success(res, 'Cases fetched successfully', result);
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Admin controllers
// ─────────────────────────────────────────────────────────────────────────────

export const createCase = asyncHandler(async (req: AuthRequest, res: Response) => {
  const files = req.files as Record<string, Express.Multer.File[]> | undefined;
  const imageFile        = files?.['image']?.[0]        ?? req.file;
  const stationImageFile = files?.['stationImage']?.[0];
  const mockCase = await casesService.createCase(req.body, req.user!._id, imageFile, stationImageFile);
  return ApiResponse.created(res, 'Case created', mockCase);
});

export const uploadCaseImage = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) {
    return ApiResponse.error(res, 'No image file uploaded', 400);
  }
  const { id } = (res.locals.params ?? req.params) as { id: string };
  const mockCase = await casesService.updateCaseImage(id, req.file);
  return ApiResponse.success(res, 'Case image updated', { imageUrl: mockCase.imageUrl });
});

export const uploadCaseStationImage = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) {
    return ApiResponse.error(res, 'No station image file uploaded', 400);
  }
  const { id } = (res.locals.params ?? req.params) as { id: string };
  const mockCase = await casesService.updateCaseStationImage(id, req.file);
  return ApiResponse.success(res, 'Station image updated', { stationImageUrl: mockCase.stationImageUrl });
});

export const getAllCasesAdmin = asyncHandler(async (req: Request, res: Response) => {
  const params = (res.locals.query ?? req.query) as CaseFilterInput;
  const result = await casesService.getAllCasesAdmin(params);
  return ApiResponse.success(res, 'All cases fetched', result);
});

export const getCaseByIdAdmin = asyncHandler(async (req: Request, res: Response) => {
  const { id } = (res.locals.params ?? req.params) as { id: string };
  const mockCase = await casesService.getCaseByIdAdmin(id);
  return ApiResponse.success(res, 'Case fetched', mockCase);
});

export const updateCase = asyncHandler(async (req: Request, res: Response) => {
  const { id } = (res.locals.params ?? req.params) as { id: string };
  const mockCase = await casesService.updateCase(id, req.body);
  return ApiResponse.success(res, 'Case updated', mockCase);
});

export const deleteCase = asyncHandler(async (req: Request, res: Response) => {
  const { id } = (res.locals.params ?? req.params) as { id: string };
  await casesService.deleteCase(id);
  return ApiResponse.success(res, 'Case deleted');
});

export const togglePublish = asyncHandler(async (req: Request, res: Response) => {
  const { id } = (res.locals.params ?? req.params) as { id: string };
  const result = await casesService.togglePublish(id);
  return ApiResponse.success(
    res,
    `Case ${result.isPublished ? 'published' : 'unpublished'} successfully`,
    result,
  );
});

export const duplicateCase = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = (res.locals.params ?? req.params) as { id: string };
  const mockCase = await casesService.duplicateCase(id, req.user!._id);
  return ApiResponse.created(res, 'Case duplicated as draft', mockCase);
});