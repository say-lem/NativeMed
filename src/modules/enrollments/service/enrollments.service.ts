import { Types } from 'mongoose';
import { AppError } from '../../../shared/utils/appError';
import { CourseAccessTier } from '../../../shared/types';
import { Enrollment } from '../model/enrollments.model';
import { Course } from '../../courses/model/courses.model';
import { User } from '../../auth/model/auth.model';
import { addDrivePermission, removeDrivePermission } from '../../../config/google-drive';
import { sendEnrollmentEmail } from '../email/enrollments.email.service';

type CourseDriveFolders = {
  lecturesDriveFolderId?: string;
  mockSessionsDriveFolderId?: string;
};

const DRIVE_FOLDER_SELECT = '+lecturesDriveFolderId +mockSessionsDriveFolderId';

const getFoldersForTier = (
  course: CourseDriveFolders,
  accessTier: CourseAccessTier,
): string[] => {
  const folders: string[] = [];

  if (
    accessTier === 'mocksessions_only' ||
    accessTier === 'mocksession_and_lectures'
  ) {
    if (course.mockSessionsDriveFolderId) {
      folders.push(course.mockSessionsDriveFolderId);
    }
  }

  if (accessTier === 'mocksession_and_lectures' && course.lecturesDriveFolderId) {
    folders.push(course.lecturesDriveFolderId);
  }

  return folders;
};

const getDriveContext = async (
  userId: Types.ObjectId | string,
  courseId: string,
  accessTier: CourseAccessTier,
): Promise<{ email: string; folderIds: string[] } | null> => {
  const [user, course] = await Promise.all([
    User.findById(userId).select('email fullName').lean(),
    Course.findById(courseId).select(DRIVE_FOLDER_SELECT).lean(),
  ]);

  if (!user) return null;

  const folderIds = course ? getFoldersForTier(course, accessTier) : [];
  if (folderIds.length === 0) {
    console.warn(
      `⚠️   Course ${courseId} has no Drive folders configured for tier "${accessTier}" — Drive access skipped. ` +
      `Set folders via POST/PATCH /api/v1/courses/${courseId}.`,
    );
    return null;
  }

  return { email: user.email, folderIds };
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

export const getEnrollmentAccessTier = async (
  userId: Types.ObjectId,
  courseId: string,
): Promise<CourseAccessTier | null> => {
  const enrollment = await Enrollment.findOne({ userId, courseId, isActive: true });
  return enrollment?.accessTier ?? null;
};

const MANUAL_PAYMENT_ID = new Types.ObjectId('000000000000000000000000');

const grantDriveFolders = async (
  userId: Types.ObjectId | string,
  courseId: string,
  accessTier: CourseAccessTier,
  message: string,
) => {
  try {
    const ctx = await getDriveContext(userId, courseId, accessTier);
    if (!ctx) return;

    await Promise.all(
      ctx.folderIds.map((folderId) => addDrivePermission(ctx.email, folderId, message)),
    );
  } catch (err) {
    console.error('❌  Drive grant failed:', err);
  }
};

const revokeDriveFolders = async (
  userId: Types.ObjectId | string,
  courseId: string,
  accessTier: CourseAccessTier,
) => {
  try {
    const ctx = await getDriveContext(userId, courseId, accessTier);
    if (!ctx) return;

    await Promise.all(
      ctx.folderIds.map((folderId) => removeDrivePermission(ctx.email, folderId)),
    );
  } catch (err) {
    console.error('❌  Drive revoke failed:', err);
  }
};

const revokeLecturesFolderIfDowngraded = async (
  userId: Types.ObjectId | string,
  courseId: string,
) => {
  try {
    const [user, course] = await Promise.all([
      User.findById(userId).select('email').lean(),
      Course.findById(courseId).select(DRIVE_FOLDER_SELECT).lean(),
    ]);

    if (!user?.email || !course?.lecturesDriveFolderId) return;

    await removeDrivePermission(user.email, course.lecturesDriveFolderId);
  } catch (err) {
    console.error('❌  Drive revoke (lectures downgrade) failed:', err);
  }
};

const grantLecturesFolderIfUpgraded = async (
  userId: Types.ObjectId | string,
  courseId: string,
  message: string,
) => {
  try {
    const [user, course] = await Promise.all([
      User.findById(userId).select('email').lean(),
      Course.findById(courseId).select(DRIVE_FOLDER_SELECT).lean(),
    ]);

    if (!user?.email || !course?.lecturesDriveFolderId) return;

    await addDrivePermission(user.email, course.lecturesDriveFolderId, message);
  } catch (err) {
    console.error('❌  Drive grant (lectures upgrade) failed:', err);
  }
};

// Fire-and-forget — don't let email failure block the enrollment flow.
const sendEnrollmentConfirmation = async (
  userId: Types.ObjectId | string,
  courseId: string,
) => {
  try {
    const [user, course] = await Promise.all([
      User.findById(userId).select('email fullName').lean(),
      Course.findById(courseId).select('title telegramChannel whatsappChannel').lean(),
    ]);
    if (!user || !course) return;

    await sendEnrollmentEmail(
      user.email,
      user.fullName,
      course.title,
      course.telegramChannel,
      course.whatsappChannel,
    );
  } catch (err) {
    console.error('❌  Enrollment email failed:', err);
  }
};

const DRIVE_ENROLLMENT_MESSAGE =
  'You have been enrolled in a Native Med course. ' +
  'You now have access to the course materials on Google Drive.';

const DRIVE_COMPLIMENTARY_MESSAGE =
  'You have been granted complimentary access to a Native Med course. ' +
  'You now have access to the course materials on Google Drive.';

const DRIVE_RESTORE_MESSAGE =
  'Your access to a Native Med course has been restored. ' +
  'You can once again access the course materials on Google Drive.';

const syncDriveAccessForTierChange = async (
  userId: Types.ObjectId | string,
  courseId: string,
  previousTier: CourseAccessTier | undefined,
  accessTier: CourseAccessTier,
) => {
  if (previousTier === accessTier) return;

  if (
    previousTier === 'mocksession_and_lectures' &&
    accessTier === 'mocksessions_only'
  ) {
    await revokeLecturesFolderIfDowngraded(userId, courseId);
    return;
  }

  if (
    previousTier === 'mocksessions_only' &&
    accessTier === 'mocksession_and_lectures'
  ) {
    await grantLecturesFolderIfUpgraded(userId, courseId, DRIVE_ENROLLMENT_MESSAGE);
    return;
  }

  if (previousTier) {
    await revokeDriveFolders(userId, courseId, previousTier);
  }

  await grantDriveFolders(userId, courseId, accessTier, DRIVE_ENROLLMENT_MESSAGE);
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
  accessTier: CourseAccessTier = 'mocksession_and_lectures',
) => {
  const existing = await Enrollment.findOne({ userId, courseId });
  const wasActive = existing?.isActive ?? false;

  const enrollment = await Enrollment.findOneAndUpdate(
    { userId, courseId },
    {
      userId,
      courseId,
      paymentId,
      accessTier,
      source: 'payment',
      isActive: true,
      accessGrantedAt: new Date(),
    },
    { upsert: true, new: true },
  );

  await grantDriveFolders(userId, courseId, accessTier, DRIVE_ENROLLMENT_MESSAGE);

  // Only on the transition into an active enrollment — skips webhook retries.
  if (!wasActive) {
    void sendEnrollmentConfirmation(userId, courseId);
  }

  return enrollment;
};

export const createEnrollmentFromSubscription = async (
  userId: Types.ObjectId,
  courseId: string,
  subscriptionId: Types.ObjectId,
  accessTier: CourseAccessTier,
) => {
  const existing = await Enrollment.findOne({ userId, courseId });
  const previousTier = existing?.accessTier;
  const wasActive = existing?.isActive ?? false;

  const enrollment = await Enrollment.findOneAndUpdate(
    { userId, courseId },
    {
      userId,
      courseId,
      paymentId: MANUAL_PAYMENT_ID,
      subscriptionId,
      accessTier,
      source: 'payment',
      isActive: true,
      accessGrantedAt: new Date(),
    },
    { upsert: true, new: true },
  );

  await syncDriveAccessForTierChange(userId, courseId, previousTier, accessTier);

  // Only on the transition into an active enrollment — skips tier changes/retries.
  if (!wasActive) {
    void sendEnrollmentConfirmation(userId, courseId);
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
  accessTier: CourseAccessTier = 'mocksession_and_lectures',
) => {
  const user = await User.findById(userId);
  if (!user) throw new AppError('User not found', 404);

  const course = await Course.findById(courseId);
  if (!course) throw new AppError('Course not found', 404);

  const existing = await Enrollment.findOne({ userId, courseId });
  if (existing?.isActive) throw new AppError('User is already enrolled in this course', 409);

  const enrollment = await Enrollment.findOneAndUpdate(
    { userId, courseId },
    {
      userId,
      courseId,
      paymentId: MANUAL_PAYMENT_ID,
      accessTier,
      source: 'manual',
      isActive: true,
      accessGrantedAt: new Date(),
      grantedBy,
    },
    { upsert: true, new: true },
  );

  await grantDriveFolders(userId, courseId, accessTier, DRIVE_COMPLIMENTARY_MESSAGE);

  void sendEnrollmentConfirmation(userId, courseId);

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

  await revokeDriveFolders(enrollment.userId as Types.ObjectId, courseId, enrollment.accessTier);
};

// ─────────────────────────────────────────────────────────────────────────────
// Revoke all enrollments for a course (admin action — called when a course is
// deleted). Unlike revokeEnrollment, this only touches currently-active
// enrollments and never throws, so it's safe to run as part of a cascade.
// Must be called with the course still in the DB — Drive folder revocation
// looks the course back up by ID to find its folders.
// ─────────────────────────────────────────────────────────────────────────────

export const revokeAllEnrollmentsForCourse = async (courseId: string): Promise<void> => {
  const enrollments = await Enrollment.find({ courseId, isActive: true });

  await Promise.all(
    enrollments.map(async (enrollment) => {
      enrollment.isActive = false;
      await enrollment.save();
      await revokeDriveFolders(enrollment.userId as Types.ObjectId, courseId, enrollment.accessTier);
    }),
  );
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

  await grantDriveFolders(
    enrollment.userId as Types.ObjectId,
    enrollment.courseId.toString(),
    enrollment.accessTier,
    DRIVE_RESTORE_MESSAGE,
  );

  return enrollment;
};

// ─────────────────────────────────────────────────────────────────────────────
// Read — user
// ─────────────────────────────────────────────────────────────────────────────

export const getMyEnrollments = async (userId: Types.ObjectId) => {
  return Enrollment.find({ userId, isActive: true })
    .populate('courseId', 'title description thumbnailUrl pricing')
    .sort({ accessGrantedAt: -1 });
};

export const checkEnrollment = async (
  userId: Types.ObjectId,
  courseId: string,
): Promise<{ enrolled: boolean; accessTier?: CourseAccessTier; accessGrantedAt?: Date }> => {
  const enrollment = await Enrollment.findOne({ userId, courseId, isActive: true });
  if (!enrollment) return { enrolled: false };
  return {
    enrolled: true,
    accessTier: enrollment.accessTier,
    accessGrantedAt: enrollment.accessGrantedAt,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Read — admin
// ─────────────────────────────────────────────────────────────────────────────

export const getAllEnrollments = async (page = 1, limit = 20) => {
  const [items, total] = await Promise.all([
    Enrollment.find()
      .populate('userId', 'fullName email phone')
      .populate('courseId', 'title pricing')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Enrollment.countDocuments(),
  ]);
  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
};

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

export const getEnrollmentsByUser = async (userId: string) => {
  return Enrollment.find({ userId })
    .populate('courseId', 'title thumbnailUrl pricing')
    .sort({ accessGrantedAt: -1 });
};
