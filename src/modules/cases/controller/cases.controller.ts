import { Request, Response } from 'express';
import { asyncHandler } from '../../../shared/middleware/asyncHandler';
import { ApiResponse } from '../../../shared/utils/apiResponse';
import { AuthRequest } from '../../../shared/types';
import * as casesService from '../service/cases.service';
import { CaseFilterInput, caseFilterSchema } from '../schema/cases.schema';

const getSingleParam = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? value[0] : (value ?? '');

// ─────────────────────────────────────────────────────────────────────────────
// Public / user controllers — published cases only
// ─────────────────────────────────────────────────────────────────────────────

export const getPublishedCases = asyncHandler(async (req: Request, res: Response) => {
  const result = await casesService.getPublishedCases(req.query as unknown as CaseFilterInput);
  return ApiResponse.success(res, 'Cases fetched', result);
});

export const getPublishedCaseById = asyncHandler(async (req: Request, res: Response) => {
  const mockCase = await casesService.getPublishedCaseById(getSingleParam(req.params.id));
  return ApiResponse.success(res, 'Case fetched', mockCase);
});

export const getPublishedSpecialties = asyncHandler(async (_req: Request, res: Response) => {
  const specialties = await casesService.getPublishedSpecialties();
  return ApiResponse.success(res, 'Specialties fetched', specialties);
});

export const getCasesBySpecialty = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const specialty = getSingleParam(req.params.specialty);
    const params = caseFilterSchema.parse(req.query);
    const result = await casesService.getCasesBySpecialty(specialty, params);
    return ApiResponse.success(res, 'Cases fetched successfully', result);
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Admin controllers
// ─────────────────────────────────────────────────────────────────────────────

export const createCase = asyncHandler(async (req: AuthRequest, res: Response) => {
  const mockCase = await casesService.createCase(req.body, req.user!._id);
  return ApiResponse.created(res, 'Case created', mockCase);
});

export const getAllCasesAdmin = asyncHandler(async (req: Request, res: Response) => {
  const result = await casesService.getAllCasesAdmin(req.query as unknown as CaseFilterInput);
  return ApiResponse.success(res, 'All cases fetched', result);
});

export const getCaseByIdAdmin = asyncHandler(async (req: Request, res: Response) => {
  const mockCase = await casesService.getCaseByIdAdmin(getSingleParam(req.params.id));
  return ApiResponse.success(res, 'Case fetched', mockCase);
});

export const updateCase = asyncHandler(async (req: Request, res: Response) => {
  const mockCase = await casesService.updateCase(getSingleParam(req.params.id), req.body);
  return ApiResponse.success(res, 'Case updated', mockCase);
});

export const deleteCase = asyncHandler(async (req: Request, res: Response) => {
  await casesService.deleteCase(getSingleParam(req.params.id));
  return ApiResponse.success(res, 'Case deleted');
});

export const togglePublish = asyncHandler(async (req: Request, res: Response) => {
  const result = await casesService.togglePublish(getSingleParam(req.params.id));
  return ApiResponse.success(
    res,
    `Case ${result.isPublished ? 'published' : 'unpublished'} successfully`,
    result,
  );
});

export const duplicateCase = asyncHandler(async (req: AuthRequest, res: Response) => {
  const mockCase = await casesService.duplicateCase(getSingleParam(req.params.id), req.user!._id);
  return ApiResponse.created(res, 'Case duplicated as draft', mockCase);
});