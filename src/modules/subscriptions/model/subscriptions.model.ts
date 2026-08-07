import { Schema, model, Document, Types } from 'mongoose';
import {
  BillingInterval,
  CourseAccessTier,
  SubscriptionStatus,
  SubscriptionType,
} from '../../../shared/types';

export interface ISubscription extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  type: SubscriptionType;
  courseId?: Types.ObjectId;
  tier?: CourseAccessTier;
  billingInterval: BillingInterval;
  status: SubscriptionStatus;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  lastStripeEventCreated?: number;
  createdAt: Date;
  updatedAt: Date;
}

const subscriptionSchema = new Schema<ISubscription>(
  {
    userId:               { type: Schema.Types.ObjectId, ref: 'User',   required: true },
    type:                 { type: String, enum: ['case_bank', 'course'], required: true },
    courseId:             { type: Schema.Types.ObjectId, ref: 'Course' },
    tier:                 { type: String, enum: ['mocksessions_only', 'mocksession_and_lectures'] },
    billingInterval:      { type: String, enum: ['monthly', 'quarterly'], required: true },
    status:               {
      type:    String,
      enum:    ['active', 'expired', 'cancelled', 'past_due'],
      default: 'active',
    },
    stripeCustomerId:     { type: String, required: true },
    stripeSubscriptionId: { type: String, required: true, unique: true },
    currentPeriodStart:   { type: Date, required: true },
    currentPeriodEnd:     { type: Date, required: true },
    cancelAtPeriodEnd:    { type: Boolean, default: false },
    lastStripeEventCreated: { type: Number },
  },
  { timestamps: true },
);

subscriptionSchema.index({ userId: 1, type: 1, status: 1 });
subscriptionSchema.index(
  { userId: 1, courseId: 1 },
  { unique: true, partialFilterExpression: { type: 'course' } },
);
subscriptionSchema.index(
  { userId: 1 },
  { unique: true, partialFilterExpression: { type: 'case_bank', status: 'active' } },
);

export const Subscription = model<ISubscription>('Subscription', subscriptionSchema);
