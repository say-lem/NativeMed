import { Schema, model, Document, Types } from 'mongoose';

export interface ICourse extends Document {
  _id: Types.ObjectId;
  title: string;
  description: string;
  /** GBP — at least one of priceMonthly / priceQuarterly must be set on the document. */
  priceMonthly?: number;
  priceQuarterly?: number;
  thumbnailUrl?: string;
  thumbnailPublicId?: string; // select:false — Cloudinary ref, used only for thumbnail deletion
  // Google Drive folder ID for this course's audio/video materials.
  // When a user enrolls, their email is granted Viewer access to this folder.
  // When enrollment is revoked, access is removed.
  // Admin: create a Drive folder, share it with the service account (Editor role),
  // then set this field via PATCH /api/v1/courses/:id
  driveFolderId?: string;     // select:false — internal, never sent to clients
  isPublished: boolean;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const courseSchema = new Schema<ICourse>(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    priceMonthly: { type: Number, min: 0 },
    priceQuarterly: { type: Number, min: 0 },
    thumbnailUrl: { type: String },
    thumbnailPublicId: { type: String, select: false }, // internal Cloudinary ref — never sent to clients
    driveFolderId: { type: String, select: false }, // Drive folder for course video/audio — opt in with +driveFolderId
    isPublished: { type: Boolean, default: false },
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