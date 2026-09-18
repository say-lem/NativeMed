import { Schema, model, Document, Types } from 'mongoose';

export interface ILiveCourse extends Document {
  _id: Types.ObjectId;
  title: string;
  description: string;
  // Longer-form write-up shown on the course detail page — `description` stays
  // the short summary used in listings/cards.
  detailedDescription?: string;
  // One-time GBP price — live courses are a single payment, not a subscription.
  price: number;
  startDate: Date;
  endDate: Date;
  thumbnailUrl?: string;
  thumbnailPublicId?: string; // select:false — Cloudinary ref, used only for thumbnail deletion
  // Google Drive folder ID — share it with the service account (Content Manager/Manager
  // role on a Shared Drive). Enrolled users are granted Viewer access to this folder.
  driveFolderId?: string;             // select:false
  telegramChannel?: string | null;    // community invite link, sent to enrollees
  whatsappChannel?: string | null;    // community invite link, sent to enrollees
  isPublished: boolean;
  // Blocks new purchases without touching visibility or isPublished — the
  // course stays listed, existing enrollments are untouched.
  paymentsPaused: boolean;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const liveCourseSchema = new Schema<ILiveCourse>(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    detailedDescription: { type: String, trim: true },
    price: { type: Number, required: true, min: 0 },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
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

liveCourseSchema.index({ isPublished: 1 });
liveCourseSchema.index({ createdBy: 1 });

// Strip internal fields from any JSON response — same pattern as Course.
liveCourseSchema.set('toJSON', {
  transform: (_doc, ret) => {
    const safeRet = ret as unknown as Record<string, unknown>;
    delete safeRet.thumbnailPublicId;
    delete safeRet.driveFolderId;
    delete safeRet.__v;
    return safeRet;
  },
});

export const LiveCourse = model<ILiveCourse>('LiveCourse', liveCourseSchema);
