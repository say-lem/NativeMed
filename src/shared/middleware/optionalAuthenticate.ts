import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import { env } from '../../config/env';
import { AuthRequest, UserRole } from '../types';

interface AccessTokenPayload {
  _id: string;
  email: string;
  role: UserRole;
}

/**
 * Same token verification as authenticate(), but never rejects the request —
 * a missing or invalid token just leaves req.user unset. For routes that
 * should work for anonymous visitors but personalize/unlock more when a
 * valid token is present (e.g. the case bank free preview).
 */
export const optionalAuthenticate = (
  req: AuthRequest,
  _res: Response,
  next: NextFunction,
): void => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return next();

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, env.ACCESS_TOKEN_SECRET) as AccessTokenPayload;
    req.user = {
      _id: decoded._id as unknown as Types.ObjectId,
      email: decoded.email,
      role: decoded.role,
    };
  } catch {
    // Invalid/expired token on an optional route — proceed anonymously.
  }

  next();
};
