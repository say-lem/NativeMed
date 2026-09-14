import { Schema, model, Document, Types } from 'mongoose';

// Singleton — one document describes how the case bank is presented as a
// product (title/description/cover image), independent of individual
// MockCase documents and of CASE_BANK_PLAN's Stripe pricing. Consumed by the
// catalog module alongside the live case count and prices.
export interface ICaseBankOverview extends Document {
  _id: Types.ObjectId;
  title: string;
  description: string;
  imageUrl?: string;
  imagePublicId?: string; // select:false — Cloudinary ref, used only for replace/delete
  createdAt: Date;
  updatedAt: Date;
}

const caseBankOverviewSchema = new Schema<ICaseBankOverview>(
  {
    title: { type: String, trim: true, maxlength: 200, default: 'Case Bank Access' },
    description: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: 'Unlimited access to all mock clinical cases.',
    },
    imageUrl: { type: String },
    imagePublicId: { type: String, select: false },
  },
  { timestamps: true },
);

// imagePublicId is an internal Cloudinary ref — never sent to clients, same
// pattern as Course.thumbnailPublicId.
caseBankOverviewSchema.set('toJSON', {
  transform: (_doc, ret) => {
    const safeRet = ret as unknown as Record<string, unknown>;
    delete safeRet.imagePublicId;
    delete safeRet.__v;
    return safeRet;
  },
});

export const CaseBankOverview = model<ICaseBankOverview>('CaseBankOverview', caseBankOverviewSchema);
