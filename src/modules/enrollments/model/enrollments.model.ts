import { Schema, model, Document, Types } from 'mongoose';
import { CourseAccessTier } from '../../../shared/types';

export type EnrollmentSource = 'payment' | 'manual';

export interface IEnrollment extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  courseId: Types.ObjectId;
  paymentId: Types.ObjectId;
  subscriptionId?: Types.ObjectId;
  accessTier: CourseAccessTier;
  source: EnrollmentSource;
  grantedBy?: Types.ObjectId;
  accessGrantedAt: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const enrollmentSchema = new Schema<IEnrollment>(
  {
    userId:         { type: Schema.Types.ObjectId, ref: 'User',         required: true },
    courseId:       { type: Schema.Types.ObjectId, ref: 'Course',       required: true },
    paymentId:      { type: Schema.Types.ObjectId, ref: 'Payment',      required: true },
    subscriptionId: { type: Schema.Types.ObjectId, ref: 'Subscription' },
    accessTier:     { type: String, enum: ['mocksessions_only', 'mocksession_and_lectures'], default: 'mocksession_and_lectures' },
    source:         { type: String, enum: ['payment', 'manual'], default: 'payment' },
    grantedBy:       { type: Schema.Types.ObjectId, ref: 'User' },
    accessGrantedAt: { type: Date, default: Date.now },
    isActive:        { type: Boolean, default: true },
  },
  { timestamps: true },
);

// Prevent duplicate enrollments — one record per user+course pair
enrollmentSchema.index({ userId: 1, courseId: 1 }, { unique: true });

// Fast lookup on every content request (IDOR guard in content.service.ts)
enrollmentSchema.index({ userId: 1, isActive: 1 });

// Admin: quickly find all users in a course
enrollmentSchema.index({ courseId: 1, isActive: 1 });

export const Enrollment = model<IEnrollment>('Enrollment', enrollmentSchema);