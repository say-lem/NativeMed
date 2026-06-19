import { Request, Response, NextFunction } from 'express';
import { AppError } from '../../../shared/utils/appError';

/**
 * When creating a case via multipart/form-data, the JSON body is sent in a
 * `payload` field so an optional `image` file can be attached in the same request.
 */
export const parseCaseCreateMultipart = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  const raw = req.body?.payload;
  if (raw === undefined || raw === null || raw === '') {
    return next();
  }

  if (typeof raw !== 'string') {
    return next(new AppError('Case payload must be a JSON string', 400));
  }

  try {
    req.body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return next(new AppError('Invalid case payload JSON', 400));
  }

  next();
};
