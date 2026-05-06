import { Request, Response, NextFunction } from 'express';
import { Error as MongooseError } from 'mongoose';
import { JsonWebTokenError } from 'jsonwebtoken';
import { AppError } from '../utils/appError';
import { ApiResponse } from '../utils/apiResponse';
import { env } from '../../config/env';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  // ── Known operational errors 
  if (err instanceof AppError) {
    ApiResponse.error(res, err.message, err.statusCode);
    return;
  }

  // ── Mongoose: document not found 
  if (err instanceof MongooseError.CastError) {
    ApiResponse.error(res, `Invalid ${err.path}: ${err.value}`, 400);
    return;
  }

  // ── Mongoose: duplicate key 
  if ((err as NodeJS.ErrnoException).name === 'MongoServerError') {
    const mongoErr = err as { code?: number; keyValue?: Record<string, unknown> };
    if (mongoErr.code === 11000) {
      const field = Object.keys(mongoErr.keyValue ?? {})[0] ?? 'field';
      ApiResponse.error(res, `${field} already exists`, 409);
      return;
    }
  }

  // ── Mongoose: validation 
  if (err instanceof MongooseError.ValidationError) {
    const messages = Object.values(err.errors).map((e) => e.message);
    ApiResponse.error(res, 'Validation error', 400, messages);
    return;
  }

  // ── JWT errors 
  if (err instanceof JsonWebTokenError) {
    ApiResponse.error(res, 'Invalid token', 401);
    return;
  }

  // ── Unknown / programmer errors 
  if (env.NODE_ENV === 'development') {
    console.error('🔴 Unhandled error:', err);
    ApiResponse.error(res, err.message, 500, { stack: err.stack });
  } else {
    console.error('🔴 Unhandled error:', err.message); // ← add this
    console.error(err.stack);                           // ← and this
    ApiResponse.error(res, 'Something went wrong', 500);
  }
};