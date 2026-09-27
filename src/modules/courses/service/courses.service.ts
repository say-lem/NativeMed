import { Types } from 'mongoose';
import { AppError } from '../../../shared/utils/appError';
import { Course, ICourse, ICoursePricing } from '../model/courses.model';
import { CreateCourseInput, UpdateCourseInput, CourseFilterInput } from '../schema/courses.schema';
import cloudinary, { CloudinaryFolders, uploadBuffer } from '../../../config/cloudinary';
import * as enrollmentsService from '../../enrollments/service/enrollments.service';
import * as subscriptionsService from '../../subscriptions/service/subscriptions.service';

// ── Admin ─────────────────────────────────────────────────────────────────────

// driveFolderId is select:false by default (never sent to public clients) —
// admin queries opt back in with this.
const adminDriveFields = '+driveFolderId';

/**
 * Admin-facing course serialization. Unlike the schema's default toJSON
 * transform (which strips the Drive folder IDs for public safety), this
 * keeps them so the admin edit form can pre-fill instead of asking the
 * admin to re-enter them on every update.
 */
export const toAdminCourseJSON = (course: ICourse) => {
  const obj = course.toObject() as Record<string, unknown>;
  delete obj.thumbnailPublicId;
  delete obj.__v;
  return obj;
};

export const createCourse = async (
  input: CreateCourseInput,
  adminId: Types.ObjectId,
) => {
  const course = await Course.create({ ...input, createdBy: adminId });
  return toAdminCourseJSON(course);
};

const hasPrice = (pricing?: ICoursePricing): boolean =>
  pricing?.monthly != null || pricing?.quarterly != null;

// existing.pricing is a Mongoose subdocument — spreading it directly does
// not reliably copy its paths, so normalize to a plain object first.
const toPlainPricing = (pricing?: ICoursePricing): ICoursePricing =>
  pricing ? { monthly: pricing.monthly, quarterly: pricing.quarterly } : {};

export const assertCourseHasPricing = (pricing: Partial<ICoursePricing>): void => {
  if (!hasPrice(pricing)) {
    throw new AppError('At least one of monthly or quarterly price is required', 400);
  }
};

export const updateCourse = async (
  courseId: string,
  input: UpdateCourseInput,
) => {
  const existing = await Course.findById(courseId);
  if (!existing) throw new AppError('Course not found', 404);

  let mergedPricing: ICoursePricing | undefined;
  if (input.pricing) {
    mergedPricing = { ...toPlainPricing(existing.pricing), ...input.pricing };
    assertCourseHasPricing(mergedPricing);
  }

  const course = await Course.findByIdAndUpdate(
    courseId,
    mergedPricing ? { ...input, pricing: mergedPricing } : input,
    { new: true },
  ).select(adminDriveFields);
  if (!course) throw new AppError('Course not found', 404);
  return toAdminCourseJSON(course);
};

/**
 * Upload a new thumbnail for a course.
 *
 * Steps:
 *  1. Fetch the course so we have the existing thumbnailPublicId (if any).
 *  2. If an old thumbnail exists, destroy it on Cloudinary BEFORE uploading the
 *     new one — prevents orphaned assets accumulating in the media library.
 *  3. Upload the new image buffer, capped to a max 1600×1600 bounding box —
 *     scaled down only if larger, never cropped, so nothing the admin uploaded
 *     is lost.
 *  4. Persist both thumbnailUrl and thumbnailPublicId back to the Course document.
 *
 * The destroy-then-upload order is intentional: if the upload fails, the old
 * thumbnail is already gone but we haven't written bad data to the DB.
 * Acceptable risk for an admin action — a retry will succeed on the next attempt.
 */
export const updateCourseThumbnail = async (
  courseId: string,
  file: Express.Multer.File,
) => {
  // 1. Confirm the course exists and grab any existing Cloudinary reference.
  // thumbnailPublicId is select:false on the schema so we must request it explicitly —
  // this is an internal service call, not a client response, so it's safe to do so.
  const course = await Course.findById(courseId).select('+thumbnailPublicId');
  if (!course) throw new AppError('Course not found', 404);

  // 2. Destroy the old thumbnail if present — no silent orphans in Cloudinary
  if (course.thumbnailPublicId) {
    try {
      await cloudinary.uploader.destroy(course.thumbnailPublicId, {
        resource_type: 'image',
      });
    } catch (err) {
      // Log but do not abort — the asset may have been manually deleted from
      // the Cloudinary dashboard. We still want to complete the new upload.
      console.error(
        `⚠️  Could not delete old thumbnail (${course.thumbnailPublicId}):`,
        err,
      );
    }
  }

  // 3. Upload the new buffer to Cloudinary
  const result = await uploadBuffer(file.buffer, {
    folder: CloudinaryFolders.THUMBNAILS,
    resource_type: 'image',
    use_filename: false,
    unique_filename: true,
    overwrite: false,
    // `limit` only ever scales down, never crops — the frontend renders whatever
    // aspect ratio comes out via object-contain, so nothing needs to be forced here.
    transformation: [{ width: 1600, height: 1600, crop: 'limit' }],
  });

  // 4. Write both fields back to the Course document atomically
  const updated = await Course.findByIdAndUpdate(
    courseId,
    {
      thumbnailUrl: result.secure_url,
      thumbnailPublicId: result.public_id,
    },
    { new: true },
  );

  if (!updated) throw new AppError('Course not found', 404);
  return updated;
};

/**
 * Deleting a course cascades: every enrollment record for it is deleted
 * (Drive access pulled first) and any subscription still billing for this
 * course is cancelled. Both must run before the course row is removed —
 * Drive revocation needs the course's folder ID, which no longer resolves
 * once it's gone.
 */
export const deleteCourse = async (courseId: string): Promise<void> => {
  const course = await Course.findById(courseId);
  if (!course) throw new AppError('Course not found', 404);

  await enrollmentsService.deleteAllEnrollmentsForCourse(courseId);
  await subscriptionsService.cancelAllSubscriptionsForCourse(courseId);

  await Course.findByIdAndDelete(courseId);
};

export const togglePublish = async (courseId: string) => {
  const course = await Course.findById(courseId);
  if (!course) throw new AppError('Course not found', 404);
  course.isPublished = !course.isPublished;
  return course.save();
};

/**
 * Pause/resume payments independently of visibility — the course stays
 * listed and viewable (isPublished untouched), but new checkouts and plan
 * changes are rejected while paused (see payments.service.ts). Existing
 * subscriptions/enrollments are untouched; this only blocks new charges.
 */
export const setCoursePaymentsPaused = async (courseId: string, paymentsPaused: boolean) => {
  const course = await Course.findById(courseId);
  if (!course) throw new AppError('Course not found', 404);
  course.paymentsPaused = paymentsPaused;
  return course.save();
};

/**
 * Admin list — includes unpublished courses.
 */
export const getAllCoursesAdmin = async (params: CourseFilterInput) => {
  const filter: Record<string, unknown> = {};
  if (params.search) {
    filter.$or = [
      { title: { $regex: params.search, $options: 'i' } },
      { description: { $regex: params.search, $options: 'i' } },
    ];
  }

  const { page, limit } = params;

  const [items, total] = await Promise.all([
    Course.find(filter)
      .select(adminDriveFields)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('createdBy', 'fullName email'),
    Course.countDocuments(filter),
  ]);

  return {
    items: items.map(toAdminCourseJSON),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
};

/**
 * Admin detail — returns unpublished courses too.
 */
export const getCourseByIdAdmin = async (courseId: string) => {
  const course = await Course.findById(courseId)
    .select(adminDriveFields)
    .populate('createdBy', 'fullName email');
  if (!course) throw new AppError('Course not found', 404);
  return toAdminCourseJSON(course);
};

// ── Public / user ─────────────────────────────────────────────────────────────

/** Public course fields returned from list/detail endpoints (prices in GBP). */
const publicCourseFields =
  'title description detailedDescription pricing thumbnailUrl telegramChannel whatsappChannel isPublished paymentsPaused createdAt updatedAt';

export const getAllPublished = async () => {
  return Course.find({ isPublished: true })
    .select(publicCourseFields)
    .sort({ createdAt: -1 });
};

export const getCourseById = async (courseId: string) => {
  const course = await Course.findOne({ _id: courseId, isPublished: true }).select(
    publicCourseFields,
  );
  if (!course) throw new AppError('Course not found', 404);
  return course;
};