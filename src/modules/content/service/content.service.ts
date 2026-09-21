import { Types } from 'mongoose';
import cloudinary, { CloudinaryFolders, uploadBufferLarge } from '../../../config/cloudinary';
import { AppError } from '../../../shared/utils/appError';
import { UserRole } from '../../../shared/types';
import { Course } from '../../courses/model/courses.model';
import { LiveCourse } from '../../liveCourses/model/liveCourses.model';
import { isEnrolled as isEnrolledInCourse } from '../../enrollments/service/enrollments.service';
import { isEnrolled as isEnrolledInLiveCourse } from '../../liveCourses/service/liveCourses.service';
import { CourseContent, ContentCourseType } from '../model/content.model';
import {
  UploadPdfInput,
  AddDriveLinkInput,
  UpdateContentInput,
} from '../schema/content.schema';

const isEnrolledFor = (courseType: ContentCourseType) =>
  courseType === 'LiveCourse' ? isEnrolledInLiveCourse : isEnrolledInCourse;

const NOT_FOUND_MESSAGE: Record<ContentCourseType, string> = {
  Course: 'Course not found',
  LiveCourse: 'Live course not found',
};

// Mongoose's two Model constructors have incompatible overload sets once
// stored in a shared union-typed variable — branching per call keeps each
// query resolving against its own concrete model.
const findCourseOwner = (
  courseId: string,
  courseType: ContentCourseType,
): Promise<{ createdBy: Types.ObjectId } | null> =>
  courseType === 'LiveCourse'
    ? LiveCourse.findById(courseId).select('createdBy')
    : Course.findById(courseId).select('createdBy');

const courseExists = (courseId: string, courseType: ContentCourseType): Promise<unknown> =>
  courseType === 'LiveCourse' ? LiveCourse.findById(courseId) : Course.findById(courseId);

// ─────────────────────────────────────────────────────────────────────────────
// IDOR guard — called before any content read
// ─────────────────────────────────────────────────────────────────────────────

const assertCanReadContent = async (
  courseId: string,
  userId: Types.ObjectId,
  role: UserRole,
  courseType: ContentCourseType = 'Course',
): Promise<void> => {
  if (role === 'admin') return;

  const course = await findCourseOwner(courseId, courseType);
  if (!course) throw new AppError(NOT_FOUND_MESSAGE[courseType], 404);
  if (course.createdBy.toString() === userId.toString()) return;

  if (await isEnrolledFor(courseType)(userId, courseId)) return;

  throw new AppError(
    'You do not have access to this content. Enroll in the course first.',
    403,
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Admin — PDF upload (Cloudinary)
// ─────────────────────────────────────────────────────────────────────────────

export const uploadPdf = async (
  courseId: string,
  input: UploadPdfInput,
  file: Express.Multer.File,
  courseType: ContentCourseType = 'Course',
) => {
  const course = await courseExists(courseId, courseType);
  if (!course) throw new AppError(NOT_FOUND_MESSAGE[courseType], 404);

  const result = await uploadBufferLarge(file.buffer, {
    folder:          CloudinaryFolders.COURSE_PDFS,
    resource_type:   'raw',
    // Cloudinary blocks unsigned delivery of PDF/ZIP by default — uploading as
    // "authenticated" makes every delivery URL signed (baked into secure_url),
    // which bypasses that block instead of depending on an account-wide toggle.
    type:            'authenticated',
    use_filename:    false,
    unique_filename: true,
    overwrite:       false,
  });

  return CourseContent.create({
    courseId,
    courseType,
    title:    input.title,
    type:     'pdf',
    fileUrl:  result.secure_url,
    publicId: result.public_id,
    order:    input.order,
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// Admin — Video / Audio Drive link entry
// The admin manually adds these files to Google Drive and provides the
// shareable link here so the content appears in the course outline.
// Drive folder access is granted on enrollment (see enrollments.service.ts /
// liveCourses.service.ts).
// ─────────────────────────────────────────────────────────────────────────────

export const addDriveLink = async (
  courseId: string,
  input: AddDriveLinkInput,
  courseType: ContentCourseType = 'Course',
) => {
  const course = await courseExists(courseId, courseType);
  if (!course) throw new AppError(NOT_FOUND_MESSAGE[courseType], 404);

  return CourseContent.create({
    courseId,
    courseType,
    title:    input.title,
    type:     input.type,   // 'video' | 'audio'
    fileUrl:  input.fileUrl, // Google Drive share link
    publicId: '',            // no Cloudinary asset for Drive content
    duration: input.duration,
    order:    input.order,
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// Admin — Update metadata (title, order, duration)
// Never re-uploads — file changes require delete + re-add
// ─────────────────────────────────────────────────────────────────────────────

export const updateContent = async (
  contentId: string,
  input: UpdateContentInput,
) => {
  const content = await CourseContent.findByIdAndUpdate(contentId, input, { new: true });
  if (!content) throw new AppError('Content not found', 404);
  return content;
};

// ─────────────────────────────────────────────────────────────────────────────
// Admin — Delete content
// PDFs: also removes the Cloudinary asset.
// Video/Audio: removes only the DB record (Drive file stays; admin deletes manually).
// ─────────────────────────────────────────────────────────────────────────────

export const deleteContent = async (contentId: string): Promise<void> => {
  const content = await CourseContent.findById(contentId).select('+publicId');
  if (!content) throw new AppError('Content not found', 404);

  if (content.type === 'pdf' && content.publicId) {
    // PDFs are uploaded as type: 'authenticated' (see uploadPdf) — destroy must
    // match or Cloudinary looks for a type: 'upload' asset that doesn't exist.
    await cloudinary.uploader.destroy(content.publicId, {
      resource_type: 'raw',
      type: 'authenticated',
    });
  }
  // For video/audio: Drive file is not touched — admin removes from Drive manually

  await content.deleteOne();
};

// ─────────────────────────────────────────────────────────────────────────────
// User (enrolled) — access-gated reads
//
// PDF delivery: Cloudinary blocks unsigned CDN delivery of files it
// recognizes as PDF/ZIP by URL extension (res.cloudinary.com/.../*.pdf),
// regardless of the asset's delivery type — confirmed this applies even to
// type: 'authenticated' assets signed via cloudinary.url(). The one thing
// that does work is the Admin API's dedicated download endpoint
// (utils.private_download_url — api.cloudinary.com/.../raw/download), which
// isn't subject to that CDN-level restriction. Its signed links expire
// (~short-lived, confirmed a 2hr-old signature is rejected), so the URL must
// be generated fresh on every read — never store/cache it.
// ─────────────────────────────────────────────────────────────────────────────

const getPdfDeliveryUrl = (publicId: string): string =>
  cloudinary.utils.private_download_url(publicId, '', {
    resource_type: 'raw',
    type: 'authenticated',
  });

export const getCourseContents = async (
  courseId: string,
  userId: Types.ObjectId,
  role: UserRole,
  courseType: ContentCourseType = 'Course',
) => {
  await assertCanReadContent(courseId, userId, role, courseType);
  const contents = await CourseContent.find({ courseId, courseType })
    .select('+publicId')
    .sort({ order: 1 });

  contents.forEach((content) => {
    if (content.type === 'pdf' && content.publicId) {
      content.fileUrl = getPdfDeliveryUrl(content.publicId);
    }
  });

  return contents;
};

export const getContentById = async (
  contentId: string,
  userId: Types.ObjectId,
  role: UserRole,
) => {
  const content = await CourseContent.findById(contentId).select('+publicId');
  if (!content) throw new AppError('Content not found', 404);
  await assertCanReadContent(content.courseId.toString(), userId, role, content.courseType);

  if (content.type === 'pdf' && content.publicId) {
    content.fileUrl = getPdfDeliveryUrl(content.publicId);
  }

  return content;
};