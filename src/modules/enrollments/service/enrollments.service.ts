import { Types } from 'mongoose';
import { AppError } from '../../../shared/utils/appError';
import { Enrollment } from '../model/enrollments.model';
import { Course } from '../../courses/model/courses.model';
import { User } from '../../auth/model/auth.model';
import { addDrivePermission, removeDrivePermission } from '../../../config/google-drive';

// ─────────────────────────────────────────────────────────────────────────────
// Internal helper
// Resolves user email + course driveFolderId in one parallel fetch.
// Returns null (and warns) when driveFolderId is not set on the course.
// ─────────────────────────────────────────────────────────────────────────────

const getDriveContext = async (
  userId: Types.ObjectId | string,
  courseId: string,
): Promise<{ email: string; folderId: string } | null> => {
  const [user, course] = await Promise.all([
    User.findById(userId).select('email fullName').lean(),
    Course.findById(courseId).select('+driveFolderId').lean(),
  ]);

  if (!user) return null;

  if (!course?.driveFolderId) {
    console.warn(
      `⚠️   Course ${courseId} has no driveFolderId — Drive access skipped. ` +
      `Set one via PATCH /api/v1/courses/${courseId}.`,
    );
    return null;
  }

  return { email: user.email, folderId: course.driveFolderId };
};

// ─────────────────────────────────────────────────────────────────────────────
// Access check — used by content.service.ts IDOR guard
// ─────────────────────────────────────────────────────────────────────────────

export const isEnrolled = async (
  userId: Types.ObjectId,
  courseId: string,
): Promise<boolean> => {
  const enrollment = await Enrollment.findOne({ userId, courseId, isActive: true });
  return !!enrollment;
};

// ─────────────────────────────────────────────────────────────────────────────
// Create enrollment (called by payments service after successful payment)
// Upsert — safe to call multiple times (Stripe webhook retries, etc.)
// Grants Google Drive access after the DB write.
// ─────────────────────────────────────────────────────────────────────────────

export const createEnrollment = async (
  userId: Types.ObjectId,
  courseId: string,
  paymentId: Types.ObjectId,
) => {
  const enrollment = await Enrollment.findOneAndUpdate(
    { userId, courseId },
    { userId, courseId, paymentId, source: 'payment', isActive: true, accessGrantedAt: new Date() },
    { upsert: true, new: true },
  );

  try {
    const ctx = await getDriveContext(userId, courseId);
    if (ctx) {
      await addDrivePermission(
        ctx.email,
        ctx.folderId,
        'You have been enrolled in a Native Med course. ' +
        'You now have access to the course audio and video materials on Google Drive.',
      );
    }
  } catch (err) {
    console.error('❌  Drive grant failed after enrollment creation:', err);
  }

  return enrollment;
};

// ─────────────────────────────────────────────────────────────────────────────
// Manual enrollment (admin action — comped / gifted access, no payment needed)
// ─────────────────────────────────────────────────────────────────────────────

export const manualEnroll = async (
  userId: string,
  courseId: string,
  grantedBy: Types.ObjectId,
) => {
  const user = await User.findById(userId);
  if (!user) throw new AppError('User not found', 404);

  const course = await Course.findById(courseId);
  if (!course) throw new AppError('Course not found', 404);

  const existing = await Enrollment.findOne({ userId, courseId });
  if (existing?.isActive) throw new AppError('User is already enrolled in this course', 409);

  // Use a placeholder ObjectId for paymentId since there's no payment
  const MANUAL_PAYMENT_ID = new Types.ObjectId('000000000000000000000000');

  const enrollment = await Enrollment.findOneAndUpdate(
    { userId, courseId },
    {
      userId,
      courseId,
      paymentId: MANUAL_PAYMENT_ID,
      source: 'manual',
      isActive: true,
      accessGrantedAt: new Date(),
      grantedBy,        // stored for audit trail
    },
    { upsert: true, new: true },
  );

  try {
    const ctx = await getDriveContext(userId, courseId);
    if (ctx) {
      await addDrivePermission(
        ctx.email,
        ctx.folderId,
        'You have been granted complimentary access to a Native Med course. ' +
        'You now have access to the course audio and video materials on Google Drive.',
      );
    }
  } catch (err) {
    console.error('❌  Drive grant failed after manual enrollment:', err);
  }

  return enrollment;
};

// ─────────────────────────────────────────────────────────────────────────────
// Revoke enrollment (admin action)
// Marks inactive and removes Drive access.
// ─────────────────────────────────────────────────────────────────────────────

export const revokeEnrollment = async (
  userId: string,
  courseId: string,
): Promise<void> => {
  const enrollment = await Enrollment.findOne({ userId, courseId });
  if (!enrollment) throw new AppError('Enrollment not found', 404);
  if (!enrollment.isActive) throw new AppError('Enrollment is already inactive', 400);

  enrollment.isActive = false;
  await enrollment.save();

  try {
    const ctx = await getDriveContext(enrollment.userId as Types.ObjectId, courseId);
    if (ctx) await removeDrivePermission(ctx.email, ctx.folderId);
  } catch (err) {
    console.error('❌  Drive revoke failed after enrollment revocation:', err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Restore enrollment (admin action)
// Re-activates a previously revoked enrollment and re-grants Drive access.
// ─────────────────────────────────────────────────────────────────────────────

export const restoreEnrollment = async (enrollmentId: string) => {
  const enrollment = await Enrollment.findById(enrollmentId);
  if (!enrollment) throw new AppError('Enrollment not found', 404);
  if (enrollment.isActive) throw new AppError('Enrollment is already active', 400);

  enrollment.isActive = true;
  enrollment.accessGrantedAt = new Date();
  await enrollment.save();

  try {
    const ctx = await getDriveContext(
      enrollment.userId as Types.ObjectId,
      enrollment.courseId.toString(),
    );
    if (ctx) {
      await addDrivePermission(
        ctx.email,
        ctx.folderId,
        'Your access to a Native Med course has been restored. ' +
        'You can once again access the course audio and video materials on Google Drive.',
      );
    }
  } catch (err) {
    console.error('❌  Drive grant failed after enrollment restore:', err);
  }

  return enrollment;
};

// ─────────────────────────────────────────────────────────────────────────────
// Read — user
// ─────────────────────────────────────────────────────────────────────────────

export const getMyEnrollments = async (userId: Types.ObjectId) => {
  return Enrollment.find({ userId, isActive: true })
    .populate('courseId', 'title description thumbnailUrl price')
    .sort({ accessGrantedAt: -1 });
};

export const checkEnrollment = async (
  userId: Types.ObjectId,
  courseId: string,
): Promise<{ enrolled: boolean; accessGrantedAt?: Date }> => {
  const enrollment = await Enrollment.findOne({ userId, courseId, isActive: true });
  if (!enrollment) return { enrolled: false };
  return { enrolled: true, accessGrantedAt: enrollment.accessGrantedAt };
};

// ─────────────────────────────────────────────────────────────────────────────
// Read — admin
// ─────────────────────────────────────────────────────────────────────────────

export const getAllEnrollments = async (page = 1, limit = 20) => {
  const [items, total] = await Promise.all([
    Enrollment.find()
      .populate('userId', 'fullName email phone')
      .populate('courseId', 'title price')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Enrollment.countDocuments(),
  ]);
  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
};

// All enrollments (active + inactive) for a specific course
export const getEnrollmentsByCourse = async (
  courseId: string,
  page = 1,
  limit = 20,
) => {
  const [items, total] = await Promise.all([
    Enrollment.find({ courseId })
      .populate('userId', 'fullName email phone')
      .sort({ accessGrantedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Enrollment.countDocuments({ courseId }),
  ]);
  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
};

// All enrollments (active + inactive) for a specific user — admin detail view
export const getEnrollmentsByUser = async (userId: string) => {
  return Enrollment.find({ userId })
    .populate('courseId', 'title thumbnailUrl price')
    .sort({ accessGrantedAt: -1 });
};