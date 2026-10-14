import { Router, Response, NextFunction } from 'express';
import * as authController from '../controller/auth.controller';
import { validate } from '../../../shared/middleware/validate';
import { authenticate } from '../../../shared/middleware/authenticate';
import { AppError } from '../../../shared/utils/appError';
import { AuthRequest } from '../../../shared/types';
import { createLeakyBucketLimiter } from '../../../shared/middleware/leakyBucket';
import {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  updateProfileSchema,
  createAdminSchema,
  updateUserByAdminSchema,
} from '../schema/auth.schema';

const requireAdmin = (req: AuthRequest, _res: Response, next: NextFunction): void => {
  if (req.user?.role !== 'admin') return next(new AppError('Forbidden', 403));
  next();
};

const router = Router();
const windowMs = 15 * 60 * 1000;
const loginLimiter = createLeakyBucketLimiter({
  capacity: 20, windowMs, message: 'Too many login attempts, please try again later.',
});
const registrationLimiter = createLeakyBucketLimiter({
  capacity: 20, windowMs, message: 'Too many registration attempts, please try again later.',
});
const passwordRecoveryLimiter = createLeakyBucketLimiter({
  capacity: 20, windowMs, message: 'Too many password recovery attempts, please try again later.',
});
// Refresh and logout must not consume the login-attempt allowance.
const refreshLimiter = createLeakyBucketLimiter({
  capacity: 600, windowMs, message: 'Too many token refresh requests, please try again later.',
});
const logoutLimiter = createLeakyBucketLimiter({
  capacity: 1500, windowMs, message: 'Too many requests, please try again later.',
});
const sessionLimiter = createLeakyBucketLimiter({
  capacity: 1500, windowMs, message: 'Too many requests, please try again later.',
  keyGenerator: (req: AuthRequest) => String(req.user!._id),
});

// Public routes
router.post('/register', registrationLimiter, validate(registerSchema), authController.register);
router.post('/login', loginLimiter, validate(loginSchema), authController.login);
router.post('/refresh-token', refreshLimiter, validate(refreshTokenSchema), authController.refreshToken);
router.post('/logout', logoutLimiter, authController.logout);
router.post('/forgot-password', passwordRecoveryLimiter, validate(forgotPasswordSchema), authController.forgotPassword);
router.post('/reset-password', passwordRecoveryLimiter, validate(resetPasswordSchema), authController.resetPassword);

// Authenticated user routes
router.use(authenticate, sessionLimiter);

router.get('/me', authController.getMe);
router.patch('/me', validate(updateProfileSchema), authController.updateProfile);
router.post('/logout-all', authController.logoutAll);
router.post('/change-password', validate(changePasswordSchema), authController.changePassword);


// Admin-only routes
router.use(requireAdmin);

router.post('/admin/users', validate(createAdminSchema), authController.createAdmin);
router.get('/admin/users', authController.getAllUsers);
router.get('/admin/users/:userId', authController.getUserById);
router.patch('/admin/users/:userId', validate(updateUserByAdminSchema), authController.updateUserByAdmin);
router.patch('/admin/users/:userId/toggle-status', authController.toggleUserStatus);

export default router;
