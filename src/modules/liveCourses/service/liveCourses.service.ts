import { Types } from 'mongoose';
import type Stripe from 'stripe';
import { env } from '../../../config/env';
import { stripe } from '../../../config/stripe';
import { AppError } from '../../../shared/utils/appError';
import cloudinary, { CloudinaryFolders, uploadBuffer } from '../../../config/cloudinary';
import { addDrivePermission, removeDrivePermission } from '../../../config/google-drive';
import { sendEnrollmentEmail } from '../../enrollments/email/enrollments.email.service';
import { User } from '../../auth/model/auth.model';
import { LiveCourse, ILiveCourse } from '../model/liveCourses.model';
import { LiveCourseEnrollment, ILiveCourseEnrollment } from '../model/liveCourseEnrollments.model';
import { CreateLiveCourseInput, UpdateLiveCourseInput, LiveCourseFilterInput, PurchaseLiveCourseInput } from '../schema/liveCourses.schema';

// driveFolderId/thumbnailPublicId/tocPdfPublicId are select:false by default
// (never sent to public clients) — admin queries opt back in with this.
const adminDriveFields = '+driveFolderId +thumbnailPublicId +tocPdfPublicId';
const DRIVE_FOLDER_SELECT = '+driveFolderId';

const MANUAL_PAYMENT_ID = new Types.ObjectId('000000000000000000000000');

const PURCHASE_MESSAGE =
  'You have purchased a Native Med live course. ' +
  'You now have access to the course materials on Google Drive.';

const COMPLIMENTARY_MESSAGE =
  'You have been granted complimentary access to a Native Med live course. ' +
  'You now have access to the course materials on Google Drive.';

const RESTORE_MESSAGE =
  'Your access to a Native Med live course has been restored. ' +
  'You can once again access the course materials on Google Drive.';

// ─────────────────────────────────────────────────────────────────────────────
// Admin — serialization
// ─────────────────────────────────────────────────────────────────────────────

export const toAdminLiveCourseJSON = (course: ILiveCourse) => {
  const obj = course.toObject() as Record<string, unknown>;
  delete obj.__v;
  return obj;
};

// ─────────────────────────────────────────────────────────────────────────────
// Admin — CRUD
// ─────────────────────────────────────────────────────────────────────────────

export const createLiveCourse = async (input: CreateLiveCourseInput, adminId: Types.ObjectId) => {
  const course = await LiveCourse.create({ ...input, createdBy: adminId });
  return toAdminLiveCourseJSON(course);
};

export const updateLiveCourse = async (courseId: string, input: UpdateLiveCourseInput) => {
  const existing = await LiveCourse.findById(courseId);
  if (!existing) throw new AppError('Live course not found', 404);

  const nextStartDate = input.startDate ?? existing.startDate;
  const nextEndDate = input.endDate ?? existing.endDate;
  if (nextEndDate <= nextStartDate) {
    throw new AppError('endDate must be after startDate', 400);
  }

  const course = await LiveCourse.findByIdAndUpdate(courseId, input, { new: true }).select(
    adminDriveFields,
  );
  if (!course) throw new AppError('Live course not found', 404);
  return toAdminLiveCourseJSON(course);
};

/**
 * Upload a new thumbnail for a live course. Same destroy-then-upload
 * ordering as courses.service.ts's updateCourseThumbnail.
 */
export const updateLiveCourseThumbnail = async (courseId: string, file: Express.Multer.File) => {
  const course = await LiveCourse.findById(courseId).select('+thumbnailPublicId');
  if (!course) throw new AppError('Live course not found', 404);

  if (course.thumbnailPublicId) {
    try {
      await cloudinary.uploader.destroy(course.thumbnailPublicId, { resource_type: 'image' });
    } catch (err) {
      console.error(`⚠️  Could not delete old thumbnail (${course.thumbnailPublicId}):`, err);
    }
  }

  const result = await uploadBuffer(file.buffer, {
    folder: CloudinaryFolders.THUMBNAILS,
    resource_type: 'image',
    use_filename: false,
    unique_filename: true,
    overwrite: false,
    // `limit` only ever scales down, never crops — nothing the admin uploaded is lost.
    transformation: [{ width: 1600, height: 1600, crop: 'limit' }],
  });

  const updated = await LiveCourse.findByIdAndUpdate(
    courseId,
    { thumbnailUrl: result.secure_url, thumbnailPublicId: result.public_id },
    { new: true },
  );

  if (!updated) throw new AppError('Live course not found', 404);
  return updated;
};

/**
 * Upload/replace the table-of-contents PDF for a live course. Same
 * destroy-then-upload ordering as updateLiveCourseThumbnail.
 *
 * Cloudinary blocks unsigned CDN delivery of PDF/ZIP assets by URL extension
 * regardless of delivery type (same reasoning as freeProducts' PDF handling),
 * so the file is stored as `resource_type: 'raw', type: 'authenticated'` and
 * a fresh signed URL is generated on every read — see getTocPdfDeliveryUrl.
 */
export const updateLiveCourseTocPdf = async (courseId: string, file: Express.Multer.File) => {
  const course = await LiveCourse.findById(courseId).select('+tocPdfPublicId');
  if (!course) throw new AppError('Live course not found', 404);

  if (course.tocPdfPublicId) {
    try {
      await cloudinary.uploader.destroy(course.tocPdfPublicId, {
        resource_type: 'raw',
        type: 'authenticated',
      });
    } catch (err) {
      console.error(`⚠️  Could not delete old TOC PDF (${course.tocPdfPublicId}):`, err);
    }
  }

  const result = await uploadBuffer(file.buffer, {
    folder: CloudinaryFolders.LIVE_COURSE_TOC_PDFS,
    resource_type: 'raw',
    type: 'authenticated',
    use_filename: false,
    unique_filename: true,
    overwrite: false,
  });

  const updated = await LiveCourse.findByIdAndUpdate(
    courseId,
    { tocPdfUrl: result.secure_url, tocPdfPublicId: result.public_id },
    { new: true },
  );

  if (!updated) throw new AppError('Live course not found', 404);
  return updated;
};

const getTocPdfDeliveryUrl = (publicId: string): string =>
  cloudinary.utils.private_download_url(publicId, '', {
    resource_type: 'raw',
    type: 'authenticated',
  });

const withTocPdfDeliveryUrl = <T extends { tocPdfPublicId?: string; tocPdfUrl?: string }>(
  course: T,
): T => {
  if (course.tocPdfPublicId) {
    course.tocPdfUrl = getTocPdfDeliveryUrl(course.tocPdfPublicId);
  }
  return course;
};

/**
 * Deleting a live course cascades: every enrollment record for it is deleted
 * (Drive access pulled first). There's no subscription to cancel — live
 * courses are a one-time payment, not a recurring billing relationship.
 */
export const deleteLiveCourse = async (courseId: string): Promise<void> => {
  const course = await LiveCourse.findById(courseId).select('+tocPdfPublicId');
  if (!course) throw new AppError('Live course not found', 404);

  if (course.tocPdfPublicId) {
    try {
      await cloudinary.uploader.destroy(course.tocPdfPublicId, {
        resource_type: 'raw',
        type: 'authenticated',
      });
    } catch (err) {
      console.error(`⚠️  Could not delete TOC PDF (${course.tocPdfPublicId}):`, err);
    }
  }

  await deleteAllEnrollmentsForCourse(courseId);

  await LiveCourse.findByIdAndDelete(courseId);
};

export const togglePublish = async (courseId: string) => {
  const course = await LiveCourse.findById(courseId);
  if (!course) throw new AppError('Live course not found', 404);
  course.isPublished = !course.isPublished;
  return course.save();
};

export const setLiveCoursePaymentsPaused = async (courseId: string, paymentsPaused: boolean) => {
  const course = await LiveCourse.findById(courseId);
  if (!course) throw new AppError('Live course not found', 404);
  course.paymentsPaused = paymentsPaused;
  return course.save();
};

/**
 * Ends a live course — revokes every currently-active enrollment's Drive
 * access and marks it inactive. The course itself, and its isPublished/
 * paymentsPaused flags, are untouched: it can still accept new purchases
 * afterward unless the admin separately unpublishes or pauses it.
 */
export const endLiveCourse = async (courseId: string): Promise<void> => {
  const course = await LiveCourse.findById(courseId);
  if (!course) throw new AppError('Live course not found', 404);

  const activeEnrollments = await LiveCourseEnrollment.find({ courseId, isActive: true });

  await Promise.all(
    activeEnrollments.map(async (enrollment) => {
      await revokeDriveAccess(enrollment.userId as Types.ObjectId, courseId);
      enrollment.isActive = false;
      await enrollment.save();
    }),
  );
};

export const getAllLiveCoursesAdmin = async (params: LiveCourseFilterInput) => {
  const filter: Record<string, unknown> = {};
  if (params.search) {
    filter.$or = [
      { title: { $regex: params.search, $options: 'i' } },
      { description: { $regex: params.search, $options: 'i' } },
    ];
  }

  const { page, limit } = params;

  const [items, total] = await Promise.all([
    LiveCourse.find(filter)
      .select(adminDriveFields)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('createdBy', 'fullName email'),
    LiveCourse.countDocuments(filter),
  ]);

  return {
    items: items.map((course) => toAdminLiveCourseJSON(withTocPdfDeliveryUrl(course))),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
};

export const getLiveCourseByIdAdmin = async (courseId: string) => {
  const course = await LiveCourse.findById(courseId)
    .select(adminDriveFields)
    .populate('createdBy', 'fullName email');
  if (!course) throw new AppError('Live course not found', 404);
  return toAdminLiveCourseJSON(withTocPdfDeliveryUrl(course));
};

// ─────────────────────────────────────────────────────────────────────────────
// Public / user reads
// ─────────────────────────────────────────────────────────────────────────────

const publicLiveCourseFields =
  'title description detailedDescription price startDate endDate thumbnailUrl tocPdfUrl telegramChannel whatsappChannel isPublished paymentsPaused createdAt updatedAt';

export const getAllPublishedLiveCourses = async () => {
  const courses = await LiveCourse.find({ isPublished: true })
    .select(`${publicLiveCourseFields} +tocPdfPublicId`)
    .sort({ startDate: 1 });
  return courses.map(withTocPdfDeliveryUrl);
};

export const getLiveCourseById = async (courseId: string) => {
  const course = await LiveCourse.findOne({ _id: courseId, isPublished: true }).select(
    `${publicLiveCourseFields} +tocPdfPublicId`,
  );
  if (!course) throw new AppError('Live course not found', 404);
  return withTocPdfDeliveryUrl(course);
};

// ─────────────────────────────────────────────────────────────────────────────
// Access check — used by content.service.ts IDOR guard
// ─────────────────────────────────────────────────────────────────────────────

export const isEnrolled = async (
  userId: Types.ObjectId,
  courseId: string,
): Promise<boolean> => {
  const enrollment = await LiveCourseEnrollment.findOne({ userId, courseId, isActive: true });
  return !!enrollment;
};

export const checkEnrollment = async (
  userId: Types.ObjectId,
  courseId: string,
): Promise<{ enrolled: boolean; accessGrantedAt?: Date }> => {
  const enrollment = await LiveCourseEnrollment.findOne({ userId, courseId, isActive: true });
  if (!enrollment) return { enrolled: false };
  return { enrolled: true, accessGrantedAt: enrollment.accessGrantedAt };
};

// ─────────────────────────────────────────────────────────────────────────────
// Drive access helpers — mirrors enrollments.service.ts's grant/revoke
// ─────────────────────────────────────────────────────────────────────────────

const getDriveContext = async (
  userId: Types.ObjectId | string,
  courseId: string,
): Promise<{ email: string; folderId: string } | null> => {
  const [user, course] = await Promise.all([
    User.findById(userId).select('email fullName').lean(),
    LiveCourse.findById(courseId).select(DRIVE_FOLDER_SELECT).lean(),
  ]);

  if (!user) return null;

  if (!course?.driveFolderId) {
    console.warn(
      `⚠️   Live course ${courseId} has no Drive folder configured — Drive access skipped.`,
    );
    return null;
  }

  return { email: user.email, folderId: course.driveFolderId };
};

const grantDriveAccess = async (
  userId: Types.ObjectId | string,
  courseId: string,
  message: string,
) => {
  try {
    const ctx = await getDriveContext(userId, courseId);
    if (!ctx) return;
    await addDrivePermission(ctx.email, ctx.folderId, message);
  } catch (err) {
    console.error('❌  Live course Drive grant failed:', err);
  }
};

const revokeDriveAccess = async (userId: Types.ObjectId | string, courseId: string) => {
  try {
    const ctx = await getDriveContext(userId, courseId);
    if (!ctx) return;
    await removeDrivePermission(ctx.email, ctx.folderId);
  } catch (err) {
    console.error('❌  Live course Drive revoke failed:', err);
  }
};

// Fire-and-forget — don't let email failure block the purchase flow.
const sendPurchaseConfirmation = async (userId: Types.ObjectId | string, courseId: string) => {
  try {
    const [user, course] = await Promise.all([
      User.findById(userId).select('email fullName').lean(),
      LiveCourse.findById(courseId).select('title telegramChannel whatsappChannel').lean(),
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
    console.error('❌  Live course purchase email failed:', err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// User — purchase (one-time Stripe Checkout, not a subscription)
// ─────────────────────────────────────────────────────────────────────────────

export const purchaseLiveCourse = async (
  userId: Types.ObjectId,
  courseId: string,
  input: PurchaseLiveCourseInput,
) => {
  const [course, user] = await Promise.all([
    LiveCourse.findById(courseId).select('title price isPublished paymentsPaused endDate'),
    User.findById(userId),
  ]);
  if (!course) throw new AppError('Live course not found', 404);
  if (!user) throw new AppError('User not found', 404);
  if (!course.isPublished) throw new AppError('This live course is not available for purchase', 400);
  if (course.paymentsPaused) throw new AppError('Payments are currently paused for this course', 400);
  if (new Date() > course.endDate) {
    throw new AppError('This live course has already ended', 400);
  }

  const existing = await LiveCourseEnrollment.findOne({ userId, courseId, isActive: true });
  if (existing) throw new AppError('You already have access to this live course', 409);

  const unitAmount = Math.round(course.price * 100);
  if (!Number.isFinite(unitAmount) || unitAmount < 50) {
    throw new AppError('This live course does not have a valid purchase price', 400);
  }

  const successUrl = input.successUrl ?? `${env.CLIENT_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = input.cancelUrl ?? `${env.CLIENT_URL}/payment/cancelled`;

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer_email: user.email,
    line_items: [
      {
        price_data: {
          currency: 'gbp',
          unit_amount: unitAmount,
          product_data: {
            name: course.title,
            metadata: { courseId: course._id.toString() },
          },
        },
        quantity: 1,
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      type: 'live_course',
      courseId: course._id.toString(),
      userId: userId.toString(),
    },
  });

  return { sessionId: session.id, url: session.url };
};

/**
 * Called from the Stripe webhook (payments.service.ts) once a live course's
 * one-time checkout session completes successfully. Mirrors
 * booking.service.ts's confirmBookingPayment — upserts so it's safe against
 * webhook retries.
 */
export const confirmLiveCoursePurchase = async (
  session: Stripe.Checkout.Session,
): Promise<ILiveCourseEnrollment | null> => {
  const courseId = session.metadata?.courseId;
  const userId = session.metadata?.userId;
  if (!courseId || !userId) return null;

  const existing = await LiveCourseEnrollment.findOne({ userId, courseId });
  const wasActive = existing?.isActive ?? false;

  const enrollment = await LiveCourseEnrollment.findOneAndUpdate(
    { userId, courseId },
    {
      userId,
      courseId,
      paymentId: MANUAL_PAYMENT_ID,
      source: 'payment',
      isActive: true,
      accessGrantedAt: new Date(),
    },
    { upsert: true, new: true },
  );

  if (!wasActive) {
    await grantDriveAccess(userId, courseId, PURCHASE_MESSAGE);
    void sendPurchaseConfirmation(userId, courseId);
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

  const course = await LiveCourse.findById(courseId);
  if (!course) throw new AppError('Live course not found', 404);

  const existing = await LiveCourseEnrollment.findOne({ userId, courseId });
  if (existing?.isActive) throw new AppError('User already has access to this live course', 409);

  const enrollment = await LiveCourseEnrollment.findOneAndUpdate(
    { userId, courseId },
    {
      userId,
      courseId,
      paymentId: MANUAL_PAYMENT_ID,
      source: 'manual',
      isActive: true,
      accessGrantedAt: new Date(),
      grantedBy,
    },
    { upsert: true, new: true },
  );

  await grantDriveAccess(userId, courseId, COMPLIMENTARY_MESSAGE);
  void sendPurchaseConfirmation(userId, courseId);

  return enrollment;
};

// ─────────────────────────────────────────────────────────────────────────────
// Revoke a single user's enrollment (admin action)
// ─────────────────────────────────────────────────────────────────────────────

export const revokeEnrollment = async (userId: string, courseId: string): Promise<void> => {
  const enrollment = await LiveCourseEnrollment.findOne({ userId, courseId });
  if (!enrollment) throw new AppError('Enrollment not found', 404);
  if (!enrollment.isActive) throw new AppError('Enrollment is already inactive', 400);

  enrollment.isActive = false;
  await enrollment.save();

  await revokeDriveAccess(enrollment.userId as Types.ObjectId, courseId);
};

// ─────────────────────────────────────────────────────────────────────────────
// Delete all enrollments for a course (admin action — called when a live
// course is deleted). Revokes Drive access for active enrollments, then
// removes every enrollment record for the course.
// ─────────────────────────────────────────────────────────────────────────────

export const deleteAllEnrollmentsForCourse = async (courseId: string): Promise<void> => {
  const activeEnrollments = await LiveCourseEnrollment.find({ courseId, isActive: true });

  await Promise.all(
    activeEnrollments.map((enrollment) =>
      revokeDriveAccess(enrollment.userId as Types.ObjectId, courseId),
    ),
  );

  await LiveCourseEnrollment.deleteMany({ courseId });
};

// ─────────────────────────────────────────────────────────────────────────────
// Restore enrollment (admin action)
// ─────────────────────────────────────────────────────────────────────────────

export const restoreEnrollment = async (enrollmentId: string) => {
  const enrollment = await LiveCourseEnrollment.findById(enrollmentId);
  if (!enrollment) throw new AppError('Enrollment not found', 404);
  if (enrollment.isActive) throw new AppError('Enrollment is already active', 400);

  enrollment.isActive = true;
  enrollment.accessGrantedAt = new Date();
  await enrollment.save();

  await grantDriveAccess(
    enrollment.userId as Types.ObjectId,
    enrollment.courseId.toString(),
    RESTORE_MESSAGE,
  );
  void sendPurchaseConfirmation(enrollment.userId as Types.ObjectId, enrollment.courseId.toString());

  return enrollment;
};

// ─────────────────────────────────────────────────────────────────────────────
// Reads
// ─────────────────────────────────────────────────────────────────────────────

export const getMyLiveCourseEnrollments = async (userId: Types.ObjectId) => {
  return LiveCourseEnrollment.find({ userId, isActive: true })
    .populate('courseId', 'title description thumbnailUrl price startDate endDate')
    .sort({ accessGrantedAt: -1 });
};

export const getEnrollmentsForCourse = async (courseId: string, page = 1, limit = 20) => {
  const [items, total] = await Promise.all([
    LiveCourseEnrollment.find({ courseId })
      .populate('userId', 'fullName email phone')
      .sort({ accessGrantedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    LiveCourseEnrollment.countDocuments({ courseId }),
  ]);
  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
};
