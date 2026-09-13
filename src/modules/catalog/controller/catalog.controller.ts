import { Request, Response } from 'express';
import { asyncHandler } from '../../../shared/middleware/asyncHandler';
import { ApiResponse } from '../../../shared/utils/apiResponse';
import * as catalogService from '../service/catalog.service';

export const getAllProducts = asyncHandler(async (_req: Request, res: Response) => {
  const products = await catalogService.getAllProducts();
  return ApiResponse.success(res, 'Products fetched', products);
});
