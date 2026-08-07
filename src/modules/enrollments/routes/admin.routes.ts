import { Router, Request, Response } from 'express';
import { asyncHandler } from '../../../shared/middleware/asyncHandler';
import { ApiResponse } from '../../../shared/utils/apiResponse';
import { authenticate } from '../../../shared/middleware/authenticate';
import { authorize } from '../../../shared/middleware/authorize';
import { User } from '../../auth/model/auth.model';
import { Course } from '../../courses/model/courses.model';
import { Enrollment, IEnrollment } from '../model/enrollments.model';
import * as subscriptionsService from '../../subscriptions/service/subscriptions.service';
import * as paymentsService from '../../payments/service/payments.service';

const getSingleParam = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? value[0] : (value ?? '');

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard
// Payment / subscription stats are placeholders until those modules exist.
// ─────────────────────────────────────────────────────────────────────────────

const getDashboardStats = asyncHandler(async (_req: Request, res: Response) => {
  const [
    totalUsers,
    totalCourses,
    totalEnrollments,
    paidEnrollments,
    manualEnrollments,
    recentEnrollments,
    activeSubscriptions,
    totalRevenue,
    recentPayments,
  ] = await Promise.all([
    User.countDocuments({ role: 'user' }),
    Course.countDocuments({ isPublished: true }),
    Enrollment.countDocuments({ isActive: true }),
    Enrollment.countDocuments({ source: 'payment', isActive: true }),
    Enrollment.countDocuments({ source: 'manual', isActive: true }),
    Enrollment.find({ isActive: true })
      .populate('userId', 'fullName email')
      .populate('courseId', 'title')
      .sort({ accessGrantedAt: -1 })
      .limit(10),
    subscriptionsService.countActiveSubscriptions(),
    paymentsService.getTotalRevenue(),
    paymentsService.getRecentPayments(10),
  ]);

  return ApiResponse.success(res, 'Dashboard stats fetched', {
    totalUsers,
    activeSubscriptions,
    totalCourses,
    totalEnrollments,
    paidEnrollments,
    manualEnrollments,
    totalRevenue,
    recentPayments,
    recentEnrollments,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Users
// ─────────────────────────────────────────────────────────────────────────────

const getUsers = asyncHandler(async (req: Request, res: Response) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;

  const [users, total] = await Promise.all([
    User.find({ role: 'user' })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    User.countDocuments({ role: 'user' }),
  ]);

  return ApiResponse.success(res, 'Users fetched', {
    items: users,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
});

/**
 * Single user detail — profile + all their enrollments (active + inactive).
 * Subscription is null until the subscriptions module is added.
 */
const getUserDetail = asyncHandler(async (req: Request, res: Response) => {
  const userId = getSingleParam(req.params.userId);

  const [user, enrollments, caseBankSubscription] = await Promise.all([
    User.findById(userId),
    Enrollment.find({ userId })
      .populate('courseId', 'title thumbnailUrl priceMonthly priceQuarterly')
      .populate('grantedBy', 'fullName email')
      .sort({ accessGrantedAt: -1 }),
    subscriptionsService.getUserCaseBankSubscription(userId),
  ]);

  if (!user) return ApiResponse.error(res, 'User not found', 404);

  const activeEnrollments = enrollments.filter((e: IEnrollment) => e.isActive);
  const revokedEnrollments = enrollments.filter((e: IEnrollment) => !e.isActive);

  return ApiResponse.success(res, 'User detail fetched', {
    user,
    subscription: caseBankSubscription,
    enrollments: {
      active: activeEnrollments,
      revoked: revokedEnrollments,
      total: enrollments.length,
    },
  });
});

/**
 * Toggle isActive on a user (ban / unban).
 */
const toggleUserStatus = asyncHandler(async (req: Request, res: Response) => {
  const user = await User.findById(getSingleParam(req.params.userId));
  if (!user) return ApiResponse.error(res, 'User not found', 404);

  user.isActive = !user.isActive;
  await user.save();

  return ApiResponse.success(
    res,
    `User ${user.isActive ? 'activated' : 'deactivated'}`,
    { isActive: user.isActive },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────────────────────

const router = Router();
router.use(authenticate, authorize('admin'));

router.get('/dashboard', getDashboardStats);
router.get('/users', getUsers);
router.get('/users/:userId', getUserDetail);
router.patch('/users/:userId/toggle-status', toggleUserStatus);

export default router;
