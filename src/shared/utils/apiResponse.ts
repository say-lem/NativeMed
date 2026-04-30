import { Response } from 'express';
import { ApiResponseBody } from '../types';

export class ApiResponse {
  static success<T>(
    res: Response,
    message: string,
    data?: T,
    statusCode = 200,
  ): Response {
    const body: ApiResponseBody<T> = { success: true, message, data };
    return res.status(statusCode).json(body);
  }

  static created<T>(res: Response, message: string, data?: T): Response {
    return ApiResponse.success(res, message, data, 201);
  }

  static error(
    res: Response,
    message: string,
    statusCode = 500,
    errors?: unknown,
  ): Response {
    const body: ApiResponseBody = { success: false, message, errors };
    return res.status(statusCode).json(body);
  }
}