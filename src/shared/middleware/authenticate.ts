import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { AppError } from '../utils/appError';
import { AuthRequest, UserRole } from '../types';

interface AccessTokenPayload {
  _id: string;
  email: string;
  role: UserRole;
}

/**
 * Validates the Bearer access token from the Authorization header.
 * Attaches decoded user to req.user on success.
 */
export const authenticate = (
  req: AuthRequest,
  _res: Response,
  next: NextFunction,
): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return next(new AppError('Access token missing', 401));
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, env.ACCESS_TOKEN_SECRET) as AccessTokenPayload;
    req.user = {
      _id: decoded._id as unknown as import('mongoose').Types.ObjectId,
      email: decoded.email,
      role: decoded.role,
    };
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return next(new AppError('Access token expired', 401));
    }
    return next(new AppError('Invalid access token', 401));
  }
};