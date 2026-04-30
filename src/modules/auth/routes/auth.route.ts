import { Router, Response, NextFunction } from 'express';
import * as authController from '../controller/auth.controller';
import { validate } from '../../../shared/middleware/validate';
import { authenticate } from '../../../shared/middleware/authenticate';
import { AppError } from '../../../shared/utils/appError';
import { AuthRequest } from '../../../shared/types';
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


// Public routes
router.post('/register', validate(registerSchema), authController.register);
router.post('/login', validate(loginSchema), authController.login);
router.post('/refresh-token', validate(refreshTokenSchema), authController.refreshToken);
router.post('/logout', authController.logout);
router.post('/forgot-password', validate(forgotPasswordSchema), authController.forgotPassword);
router.post('/reset-password', validate(resetPasswordSchema), authController.resetPassword);

// Authenticated user routes
router.use(authenticate);

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