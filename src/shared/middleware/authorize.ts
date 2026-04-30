import { Response, NextFunction } from 'express';
import { AuthRequest, UserRole } from '../types';
import { AppError } from '../utils/appError';

/**
 * Role guard — call after authenticate().
 * Usage: router.delete('/...', authenticate, authorize('admin'), controller)
 */
export const authorize = (...allowedRoles: UserRole[]) =>
  (req: AuthRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AppError('Not authenticated', 401));
    }
    if (!allowedRoles.includes(req.user.role)) {
      return next(new AppError('Insufficient permissions', 403));
    }
    next();
  };