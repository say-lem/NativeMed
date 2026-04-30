import { Schema, model, Document, Types } from 'mongoose';
import { ContentType } from '../../../shared/types';

export interface ICourseContent extends Document {
  _id: Types.ObjectId;
  courseId: Types.ObjectId;
  title: string;
  type: ContentType;
  fileUrl: string;
  publicId: string;          // Cloudinary public ID for deletions
  duration?: number;          // seconds — relevant for audio/video
  order: number;              // display order within a course
  createdAt: Date;
  updatedAt: Date;
}

const courseContentSchema = new Schema<ICourseContent>(
  {
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
    title: { type: String, required: true, trim: true },
    type: { type: String, enum: ['video', 'audio', 'pdf'], required: true },
    fileUrl: { type: String, required: true },
    publicId: { type: String, required: true },
    duration: { type: Number },
    order: { type: Number, required: true, default: 0 },
  },
  { timestamps: true },
);

// Fetch all content for a course in order
courseContentSchema.index({ courseId: 1, order: 1 });

export const CourseContent = model<ICourseContent>('CourseContent', courseContentSchema);