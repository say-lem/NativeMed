import { Types } from 'mongoose';
import cloudinary, { CloudinaryFolders, uploadBuffer } from '../../../config/cloudinary';
import { AppError } from '../../../shared/utils/appError';
import { UserRole } from '../../../shared/types';
import { Course } from '../../courses/model/courses.model';
import { isEnrolled } from '../../enrollments/service/enrollments.service';
import { CourseContent } from '../model/content.model';
import {
  UploadPdfInput,
  AddDriveLinkInput,
  UpdateContentInput,
} from '../schema/content.schema';

// ─────────────────────────────────────────────────────────────────────────────
// IDOR guard — called before any content read
// ─────────────────────────────────────────────────────────────────────────────

const assertCanReadContent = async (
  courseId: string,
  userId: Types.ObjectId,
  role: UserRole,
): Promise<void> => {
  if (role === 'admin') return;

  const course = await Course.findById(courseId).select('createdBy');
  if (!course) throw new AppError('Course not found', 404);
  if (course.createdBy.toString() === userId.toString()) return;

  if (await isEnrolled(userId, courseId)) return;

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
) => {
  const course = await Course.findById(courseId);
  if (!course) throw new AppError('Course not found', 404);

  const result = await uploadBuffer(file.buffer, {
    folder:          CloudinaryFolders.COURSE_PDFS,
    resource_type:   'raw',
    use_filename:    false,
    unique_filename: true,
    overwrite:       false,
  });

  return CourseContent.create({
    courseId,
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
// Drive folder access is granted on enrollment (see enrollments.service.ts).
// ─────────────────────────────────────────────────────────────────────────────

export const addDriveLink = async (
  courseId: string,
  input: AddDriveLinkInput,
) => {
  const course = await Course.findById(courseId);
  if (!course) throw new AppError('Course not found', 404);

  return CourseContent.create({
    courseId,
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
    await cloudinary.uploader.destroy(content.publicId, { resource_type: 'raw' });
  }
  // For video/audio: Drive file is not touched — admin removes from Drive manually

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
  await assertCanReadContent(courseId, userId, role);
  return CourseContent.find({ courseId }).sort({ order: 1 });
};

export const getContentById = async (
  contentId: string,
  userId: Types.ObjectId,
  role: UserRole,
) => {
  const content = await CourseContent.findById(contentId);
  if (!content) throw new AppError('Content not found', 404);
  await assertCanReadContent(content.courseId.toString(), userId, role);

  return content;
};