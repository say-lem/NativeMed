import { Schema, model, Document, Types } from 'mongoose';
import { ContentType } from '../../../shared/types';

// Which parent collection courseId points into — lets one CourseContent
// collection serve both normal courses (subscription-based) and live courses
// (one-time payment), via Mongoose's dynamic ref (refPath).
export type ContentCourseType = 'Course' | 'LiveCourse';

export interface ICourseContent extends Document {
  _id: Types.ObjectId;
  courseId: Types.ObjectId;
  courseType: ContentCourseType;
  title: string;
  type: ContentType;
  fileUrl: string;
  publicId: string;     // Cloudinary public ID — select:false, used only for PDF deletion
  duration?: number;    // seconds — for audio/video (entered manually by admin, not derived from upload)
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

const courseContentSchema = new Schema<ICourseContent>(
  {
    courseId:   { type: Schema.Types.ObjectId, required: true, refPath: 'courseType' },
    // Defaults to 'Course' so existing rows (predating live courses) resolve unchanged.
    courseType: { type: String, enum: ['Course', 'LiveCourse'], default: 'Course' },
    title:      { type: String, required: true, trim: true },
    type:       { type: String, enum: ['video', 'audio', 'pdf'], required: true },
    fileUrl:    { type: String, required: true },
    // For PDFs: Cloudinary public_id (for deletion). Not needed for video/audio (Drive links).
    publicId:   { type: String, select: false, default: '' },
    duration:   { type: Number },
    order:      { type: Number, required: true, default: 0 },
  },
  { timestamps: true },
);

courseContentSchema.index({ courseId: 1, order: 1 });

// publicId is internal (Cloudinary ref for PDF deletion/delivery) — never sent to clients,
// same pattern as thumbnailPublicId on Course.
courseContentSchema.set('toJSON', {
  transform: (_doc, ret) => {
    const safeRet = ret as unknown as Record<string, unknown>;
    delete safeRet.publicId;
    delete safeRet.__v;
    return safeRet;
  },
});

export const CourseContent = model<ICourseContent>('CourseContent', courseContentSchema);