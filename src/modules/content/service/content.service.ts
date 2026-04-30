import { Types } from 'mongoose';
import cloudinary, { CloudinaryFolders, uploadBuffer } from '../../../config/cloudinary';
import { AppError } from '../../../shared/utils/appError';
import { UserRole, ContentType } from '../../../shared/types';
import { Course } from '../../courses/model/courses.model';
import { CourseContent } from '../model/content.model';
import { UploadContentInput, UpdateContentInput } from '../schema/content.schema';
import { ALLOWED_CONTENT_TYPES } from '../upload/content.upload';

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Derive the canonical ContentType from the actual file mimetype.
 * This is the source of truth — we NEVER trust input.type from the request body
 * because a client could mark a PDF upload as 'video' to confuse downstream logic.
 */
const deriveContentType = (mimetype: string): ContentType => {
  if (mimetype.startsWith('video/')) return 'video';
  if (mimetype.startsWith('audio/')) return 'audio';
  if (mimetype === 'application/pdf') return 'pdf';
  // Should never reach here — multer's fileFilter already blocked unknown types
  throw new AppError(`Cannot derive content type from mimetype: ${mimetype}`, 400);
};

/**
 * Map the real mimetype to Cloudinary upload params.
 * Kept separate from deriveContentType so the two concerns don't cross.
 */
const getCloudinaryParams = (
  mimetype: string,
): { folder: string; resource_type: 'video' | 'raw' | 'image' } => {
  if (mimetype.startsWith('video/')) {
    return { folder: CloudinaryFolders.COURSE_VIDEOS, resource_type: 'video' };
  }
  if (mimetype.startsWith('audio/')) {
    // Cloudinary uses resource_type 'video' for audio files
    return { folder: CloudinaryFolders.COURSE_AUDIOS, resource_type: 'video' };
  }
  if (mimetype === 'application/pdf') {
    return { folder: CloudinaryFolders.COURSE_PDFS, resource_type: 'raw' };
  }
  throw new AppError(`Unsupported mimetype: ${mimetype}`, 400);
};

/**
 * Enforce per-type file size limits after multer has buffered the file.
 * Multer's top-level limit is 500 MB (video ceiling) so audio/pdf files that
 * exceed their own type limits would otherwise slip through.
 */
const enforceSizeLimit = (mimetype: string, sizeBytes: number): void => {
  const config = ALLOWED_CONTENT_TYPES[mimetype];
  if (!config) return;

  const limitBytes = config.maxMb * 1024 * 1024;
  if (sizeBytes > limitBytes) {
    throw new AppError(
      `${config.label} files must be under ${config.maxMb} MB. ` +
      `Received: ${(sizeBytes / 1024 / 1024).toFixed(1)} MB`,
      413,
    );
  }
};

/**
 * IDOR guard — called before any content read operation.
 *
 * Access is granted when the user is:
 *   a) an admin, OR
 *   b) the course creator (covers super-admin content review)
 *
 * TODO: extend this to also allow enrolled users once the Enrollments module
 * is wired up. The signature is already designed to accept userId/role so
 * adding an enrollment check here is a one-liner addition.
 */
const assertCanReadCourseContent = async (
  courseId: string,
  userId: Types.ObjectId,
  role: UserRole,
): Promise<void> => {
  // Admins always have read access
  if (role === 'admin') return;

  const course = await Course.findById(courseId).select('createdBy isPublished');
  if (!course) throw new AppError('Course not found', 404);

  // The course creator can always read their own content
  if (course.createdBy.toString() === userId.toString()) return;

  // ── Enrollment check placeholder ──────────────────────────────────────────
  // Uncomment and replace the import once enrollments.service.ts is ready:
  //
  // const enrolled = await isEnrolled(userId, courseId);
  // if (enrolled) return;

  throw new AppError(
    'You do not have access to this course content. Enroll in the course first.',
    403,
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Admin write operations
// ─────────────────────────────────────────────────────────────────────────────

export const addContent = async (
  courseId: string,
  input: UploadContentInput,
  file: Express.Multer.File,
) => {
  // 1. Per-type size guard (catches audio/pdf over their type limit)
  enforceSizeLimit(file.mimetype, file.size);

  // 2. Derive canonical type from real MIME — never trust input.type
  const contentType = deriveContentType(file.mimetype);

  // 3. Determine Cloudinary params
  const { folder, resource_type } = getCloudinaryParams(file.mimetype);

  // 4. Stream buffer to Cloudinary
  const uploadResult = await uploadBuffer(file.buffer, {
    folder,
    resource_type,
    use_filename: false,
    unique_filename: true,
    overwrite: false,
  });

  // 5. Persist — type comes from MIME derivation, not from the client body
  return CourseContent.create({
    courseId,
    title: input.title,
    type: contentType,          // ← derived from file.mimetype, not input.type
    fileUrl: uploadResult.secure_url,
    publicId: uploadResult.public_id,
    duration: input.duration,
    order: input.order,
  });
};

export const updateContent = async (
  contentId: string,
  input: UpdateContentInput,
) => {
  const content = await CourseContent.findByIdAndUpdate(contentId, input, { new: true });
  if (!content) throw new AppError('Content not found', 404);
  return content;
};

export const deleteContent = async (contentId: string): Promise<void> => {
  const content = await CourseContent.findById(contentId);
  if (!content) throw new AppError('Content not found', 404);

  const resourceType =
    content.type === 'pdf' ? 'raw' : 'video'; // video and audio both use 'video'

  await cloudinary.uploader.destroy(content.publicId, { resource_type: resourceType });
  await content.deleteOne();
};

// ─────────────────────────────────────────────────────────────────────────────
// User (enrolled) — access-gated reads
// ─────────────────────────────────────────────────────────────────────────────

export const getCourseContents = async (
  courseId: string,
  userId: Types.ObjectId,
  role: UserRole,
) => {
  await assertCanReadCourseContent(courseId, userId, role);
  return CourseContent.find({ courseId }).sort({ order: 1 });
};

export const getContentById = async (
  contentId: string,
  userId: Types.ObjectId,
  role: UserRole,
) => {
  const content = await CourseContent.findById(contentId);
  if (!content) throw new AppError('Content not found', 404);

  // Guard uses the content's own courseId — no extra param needed
  await assertCanReadCourseContent(content.courseId.toString(), userId, role);

  return content;
};