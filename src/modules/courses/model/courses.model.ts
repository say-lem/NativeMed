import { Schema, model, Document, Types } from 'mongoose';

export interface ITierPricing {
  monthly?: number;
  quarterly?: number;
}

/** GBP — each tier must have at least one of monthly / quarterly set on the document. */
export interface ICoursePricing {
  mocksessions_only: ITierPricing;
  mocksession_and_lectures: ITierPricing;
}

export interface ICourse extends Document {
  _id: Types.ObjectId;
  title: string;
  description: string;
  pricing: ICoursePricing;
  thumbnailUrl?: string;
  thumbnailPublicId?: string; // select:false — Cloudinary ref, used only for thumbnail deletion
  // Google Drive folder IDs — share each folder with the service account (Editor role).
  // On enrollment, users are granted Viewer access based on their subscription tier.
  lecturesDriveFolderId?: string;     // select:false — lectures folder
  mockSessionsDriveFolderId?: string; // select:false — mock sessions folder
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

const tierPricingSchema = new Schema<ITierPricing>(
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
    pricing: {
      mocksessions_only: { type: tierPricingSchema, default: () => ({}) },
      mocksession_and_lectures: { type: tierPricingSchema, default: () => ({}) },
    },
    thumbnailUrl: { type: String },
    thumbnailPublicId: { type: String, select: false }, // internal Cloudinary ref — never sent to clients
    lecturesDriveFolderId: { type: String, select: false },
    mockSessionsDriveFolderId: { type: String, select: false },
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
    delete safeRet.lecturesDriveFolderId;
    delete safeRet.mockSessionsDriveFolderId;
    delete safeRet.__v;
    return safeRet;
  },
});

export const Course = model<ICourse>('Course', courseSchema);