import { Types } from 'mongoose';
import { AppError } from '../../../shared/utils/appError';
import { Course } from '../model/courses.model';
import { CreateCourseInput, UpdateCourseInput, CourseFilterInput } from '../schema/courses.schema';
import cloudinary, { CloudinaryFolders, uploadBuffer } from '../../../config/cloudinary';

// ── Admin ─────────────────────────────────────────────────────────────────────

export const createCourse = async (
  input: CreateCourseInput,
  adminId: Types.ObjectId,
) => {
  return Course.create({ ...input, createdBy: adminId });
};

export const updateCourse = async (
  courseId: string,
  input: UpdateCourseInput,
) => {
  const course = await Course.findByIdAndUpdate(courseId, input, { new: true });
  if (!course) throw new AppError('Course not found', 404);
  return course;
};

/**
 * Upload a new thumbnail for a course.
 *
 * Steps:
 *  1. Fetch the course so we have the existing thumbnailPublicId (if any).
 *  2. If an old thumbnail exists, destroy it on Cloudinary BEFORE uploading the
 *     new one — prevents orphaned assets accumulating in the media library.
 *  3. Upload the new image buffer and resize to a consistent 800×450 (16:9).
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
    // Enforce a consistent 16:9 aspect ratio for all course thumbnails
    transformation: [{ width: 800, height: 450, crop: 'fill', gravity: 'auto' }],
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

export const deleteCourse = async (courseId: string): Promise<void> => {
  const course = await Course.findByIdAndDelete(courseId);
  if (!course) throw new AppError('Course not found', 404);
};

export const togglePublish = async (courseId: string) => {
  const course = await Course.findById(courseId);
  if (!course) throw new AppError('Course not found', 404);
  course.isPublished = !course.isPublished;
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
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('createdBy', 'fullName email'),
    Course.countDocuments(filter),
  ]);

  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
};

/**
 * Admin detail — returns unpublished courses too.
 */
export const getCourseByIdAdmin = async (courseId: string) => {
  const course = await Course.findById(courseId).populate('createdBy', 'fullName email');
  if (!course) throw new AppError('Course not found', 404);
  return course;
};

// ── Public / user ─────────────────────────────────────────────────────────────

export const getAllPublished = async () => {
  return Course.find({ isPublished: true }).sort({ createdAt: -1 });
};

export const getCourseById = async (courseId: string) => {
  const course = await Course.findOne({ _id: courseId, isPublished: true });
  if (!course) throw new AppError('Course not found', 404);
  return course;
};