import { Schema, model, Document, Types } from 'mongoose';
import {
  BillingInterval,
  PaymentItemType,
  PaymentMethod,
  PaymentStatus,
} from '../../../shared/types';

export interface IPayment extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  subscriptionId?: Types.ObjectId;
  amount: number;
  currency: string;
  status: PaymentStatus;
  method: PaymentMethod;
  itemType: PaymentItemType;
  courseId?: Types.ObjectId;
  bookingId?: Types.ObjectId;
  liveCourseId?: Types.ObjectId;
  billingInterval?: BillingInterval;
  stripeInvoiceId?: string;
  stripePaymentIntentId?: string;
  stripeCheckoutSessionId?: string;
  paidAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const paymentSchema = new Schema<IPayment>(
  {
    userId:                  { type: Schema.Types.ObjectId, ref: 'User',         required: true },
    subscriptionId:          { type: Schema.Types.ObjectId, ref: 'Subscription' },
    amount:                  { type: Number, required: true },
    currency:                { type: String, default: 'gbp' },
    status:                  {
      type:    String,
      enum:    ['pending', 'succeeded', 'failed', 'refunded'],
      default: 'pending',
    },
    method:                  { type: String, enum: ['stripe'], default: 'stripe' },
    itemType:                { type: String, enum: ['case_bank', 'course', 'booking', 'live_course'], required: true },
    courseId:                { type: Schema.Types.ObjectId, ref: 'Course' },
    bookingId:               { type: Schema.Types.ObjectId, ref: 'SessionBooking' },
    liveCourseId:            { type: Schema.Types.ObjectId, ref: 'LiveCourse' },
    billingInterval:         { type: String, enum: ['monthly', 'quarterly'] },
    stripeInvoiceId:         { type: String },
    stripePaymentIntentId:   { type: String },
    stripeCheckoutSessionId: { type: String },
    paidAt:                  { type: Date },
  },
  { timestamps: true },
);

paymentSchema.index({ userId: 1, createdAt: -1 });
paymentSchema.index({ stripeInvoiceId: 1 }, { sparse: true, unique: true });
// unique — booking payments are upserted keyed on this (one Payment per checkout session)
paymentSchema.index({ stripeCheckoutSessionId: 1 }, { sparse: true, unique: true });

export const Payment = model<IPayment>('Payment', paymentSchema);
