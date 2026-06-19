import { Schema, model, Document, Types } from 'mongoose';
import { ContentType } from '../../../shared/types';

export interface ICourseContent extends Document {
  _id: Types.ObjectId;
  courseId: Types.ObjectId;
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
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
    title:    { type: String, required: true, trim: true },
    type:     { type: String, enum: ['video', 'audio', 'pdf'], required: true },
    fileUrl:  { type: String, required: true },
    // For PDFs: Cloudinary public_id (for deletion). Not needed for video/audio (Drive links).
    publicId: { type: String, select: false, default: '' },
    duration: { type: Number },
    order:    { type: Number, required: true, default: 0 },
  },
  { timestamps: true },
);

courseContentSchema.index({ courseId: 1, order: 1 });

export const CourseContent = model<ICourseContent>('CourseContent', courseContentSchema);