import { Schema, model, Document, Types } from 'mongoose';

export type LiveCourseEnrollmentSource = 'payment' | 'manual';

export interface ILiveCourseEnrollment extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  courseId: Types.ObjectId;
  paymentId: Types.ObjectId;
  source: LiveCourseEnrollmentSource;
  grantedBy?: Types.ObjectId;
  accessGrantedAt: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const liveCourseEnrollmentSchema = new Schema<ILiveCourseEnrollment>(
  {
    userId:          { type: Schema.Types.ObjectId, ref: 'User',       required: true },
    courseId:        { type: Schema.Types.ObjectId, ref: 'LiveCourse', required: true },
    paymentId:       { type: Schema.Types.ObjectId, ref: 'Payment',    required: true },
    source:          { type: String, enum: ['payment', 'manual'], default: 'payment' },
    grantedBy:       { type: Schema.Types.ObjectId, ref: 'User' },
    accessGrantedAt: { type: Date, default: Date.now },
    isActive:        { type: Boolean, default: true },
  },
  { timestamps: true },
);

// Prevent duplicate enrollments — one record per user+course pair
liveCourseEnrollmentSchema.index({ userId: 1, courseId: 1 }, { unique: true });

// Fast lookup on every content request (IDOR guard in content.service.ts)
liveCourseEnrollmentSchema.index({ userId: 1, isActive: 1 });

// Admin: quickly find all users in a course / roster + "end course" revocation
liveCourseEnrollmentSchema.index({ courseId: 1, isActive: 1 });

export const LiveCourseEnrollment = model<ILiveCourseEnrollment>(
  'LiveCourseEnrollment',
  liveCourseEnrollmentSchema,
);
