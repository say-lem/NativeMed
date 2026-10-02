import { Request, Response } from 'express';
import { asyncHandler } from '../../../shared/middleware/asyncHandler';
import { ApiResponse } from '../../../shared/utils/apiResponse';
import { PdfUploadSignatureInput } from '../schema/uploads.schema';
import * as uploadsService from '../service/uploads.service';

export const createPdfUploadSignature = asyncHandler(async (req: Request, res: Response) => {
  const input = req.body as PdfUploadSignatureInput;
  const signature = uploadsService.createPdfUploadSignature(input);
  return ApiResponse.success(res, 'Upload signature created', signature);
});
