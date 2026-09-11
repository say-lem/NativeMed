import { Request, Response } from 'express';
import { asyncHandler } from '../../../shared/middleware/asyncHandler';
import { ApiResponse } from '../../../shared/utils/apiResponse';
import { AuthRequest } from '../../../shared/types';
import {
  CreateLinkFreeProductInput,
  UploadPdfFreeProductInput,
  UploadBlogFreeProductInput,
  UpdateFreeProductInput,
} from '../schema/freeProducts.schema';
import * as freeProductsService from '../service/freeProducts.service';

const getSingleParam = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? value[0] : (value ?? '');

// ─────────────────────────────────────────────────────────────────────────────
// Public — no auth
// ─────────────────────────────────────────────────────────────────────────────

export const getPublishedProducts = asyncHandler(async (req: Request, res: Response) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;
  const result = await freeProductsService.getPublishedProducts(page, limit);
  return ApiResponse.success(res, 'Free products fetched', result);
});

export const getPublishedProductById = asyncHandler(async (req: Request, res: Response) => {
  const product = await freeProductsService.getPublishedProductById(getSingleParam(req.params.productId));
  return ApiResponse.success(res, 'Free product fetched', product);
});

// ─────────────────────────────────────────────────────────────────────────────
// Admin
// ─────────────────────────────────────────────────────────────────────────────

export const createLinkProduct = asyncHandler(async (req: AuthRequest, res: Response) => {
  const input = req.body as CreateLinkFreeProductInput;
  const product = await freeProductsService.createLinkProduct(input, req.user!._id);
  return ApiResponse.created(res, 'Free product created', product);
});

export const uploadPdfProduct = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.file) return ApiResponse.error(res, 'No PDF file uploaded', 400);
  const input = req.body as UploadPdfFreeProductInput;
  const product = await freeProductsService.uploadPdfProduct(input, req.file, req.user!._id);
  return ApiResponse.created(res, 'Free product created', product);
});

export const uploadBlogProduct = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.file) return ApiResponse.error(res, 'No cover image uploaded', 400);
  const input = req.body as UploadBlogFreeProductInput;
  const product = await freeProductsService.uploadBlogProduct(input, req.file, req.user!._id);
  return ApiResponse.created(res, 'Free product created', product);
});

export const replaceCoverImage = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) return ApiResponse.error(res, 'No cover image uploaded', 400);
  const product = await freeProductsService.replaceBlogCoverImage(getSingleParam(req.params.productId), req.file);
  return ApiResponse.success(res, 'Cover image updated', product);
});

export const getAllProducts = asyncHandler(async (req: Request, res: Response) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;
  const result = await freeProductsService.getAllProducts(page, limit);
  return ApiResponse.success(res, 'Free products fetched', result);
});

export const updateProduct = asyncHandler(async (req: Request, res: Response) => {
  const input = req.body as UpdateFreeProductInput;
  const product = await freeProductsService.updateProduct(getSingleParam(req.params.productId), input);
  return ApiResponse.success(res, 'Free product updated', product);
});

export const publishProduct = asyncHandler(async (req: Request, res: Response) => {
  const product = await freeProductsService.setProductPublished(getSingleParam(req.params.productId), true);
  return ApiResponse.success(res, 'Free product published', product);
});

export const unpublishProduct = asyncHandler(async (req: Request, res: Response) => {
  const product = await freeProductsService.setProductPublished(getSingleParam(req.params.productId), false);
  return ApiResponse.success(res, 'Free product unpublished', product);
});

export const deleteProduct = asyncHandler(async (req: Request, res: Response) => {
  await freeProductsService.deleteProduct(getSingleParam(req.params.productId));
  return ApiResponse.success(res, 'Free product deleted');
});
