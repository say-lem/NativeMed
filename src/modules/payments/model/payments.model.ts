import { Schema, model, Document, Types } from 'mongoose';
import {
  BillingInterval,
  CourseAccessTier,
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
  tier?: CourseAccessTier;
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
    itemType:                { type: String, enum: ['case_bank', 'course'], required: true },
    courseId:                { type: Schema.Types.ObjectId, ref: 'Course' },
    tier:                    { type: String, enum: ['pdf_only', 'pdf_drive'] },
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
paymentSchema.index({ stripeCheckoutSessionId: 1 }, { sparse: true });

export const Payment = model<IPayment>('Payment', paymentSchema);
