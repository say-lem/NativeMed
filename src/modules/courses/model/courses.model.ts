import { Schema, model, Document, Types } from 'mongoose';

/** GBP — at least one of monthly / quarterly must be set on the document. */
export interface ICoursePricing {
  monthly?: number;
  quarterly?: number;
}

export interface ICourse extends Document {
  _id: Types.ObjectId;
  title: string;
  description: string;
  // Longer-form write-up shown on the course detail page — `description` stays
  // the short summary used in listings/cards.
  detailedDescription?: string;
  pricing: ICoursePricing;
  thumbnailUrl?: string;
  thumbnailPublicId?: string; // select:false — Cloudinary ref, used only for thumbnail deletion
  // Google Drive folder ID — share it with the service account (Content Manager/Manager
  // role on a Shared Drive). Enrolled users are granted Viewer access to this folder.
  driveFolderId?: string;             // select:false
  telegramChannel?: string | null;    // community invite link, sent to enrollees
  whatsappChannel?: string | null;    // community invite link, sent to enrollees
  isPublished: boolean;
  // Blocks new checkouts/plan changes without touching visibility or isPublished —
  // the course stays listed, existing subscriptions are untouched (see payments.service.ts).
  paymentsPaused: boolean;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const coursePricingSchema = new Schema<ICoursePricing>(
  {
    monthly: { type: Number, min: 0 },
    quarterly: { type: Number, min: 0 },
  },
  { _id: false },
);

const courseSchema = new Schema<ICourse>(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    detailedDescription: { type: String, trim: true },
    pricing: { type: coursePricingSchema, default: () => ({}) },
    thumbnailUrl: { type: String },
    thumbnailPublicId: { type: String, select: false }, // internal Cloudinary ref — never sent to clients
    driveFolderId: { type: String, select: false },
    telegramChannel: { type: String, trim: true, default: null },
    whatsappChannel: { type: String, trim: true, default: null },
    isPublished: { type: Boolean, default: false },
    paymentsPaused: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

courseSchema.index({ isPublished: 1 });
courseSchema.index({ createdBy: 1 });

// Strip internal fields from any JSON response — same pattern as passwordHash on User
courseSchema.set('toJSON', {
  transform: (_doc, ret) => {
    const safeRet = ret as unknown as Record<string, unknown>;
    delete safeRet.thumbnailPublicId;
    delete safeRet.driveFolderId;
    delete safeRet.__v;
    return safeRet;
  },
});

export const Course = model<ICourse>('Course', courseSchema);