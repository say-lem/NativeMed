import { Schema, model, Document, Types } from 'mongoose';

export type FreeProductType = 'link' | 'pdf';

export interface IFreeProduct extends Document {
  _id: Types.ObjectId;
  title: string;
  description: string;
  type: FreeProductType;
  fileUrl: string;    // external link (type: link) or Cloudinary secure_url (type: pdf, not used for delivery — see service)
  publicId: string;   // Cloudinary public ID — select:false, only set for type: pdf, used for delivery + deletion
  isPublished: boolean;
  order: number;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const freeProductSchema = new Schema<IFreeProduct>(
  {
    title:       { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, required: true, trim: true, maxlength: 2000 },
    type:        { type: String, enum: ['link', 'pdf'], required: true },
    fileUrl:     { type: String, required: true },
    publicId:    { type: String, select: false, default: '' },
    isPublished: { type: Boolean, default: true },
    order:       { type: Number, required: true, default: 0 },
    createdBy:   { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

// Public feed — published items, ordered for display
freeProductSchema.index({ isPublished: 1, order: 1 });

// publicId is an internal Cloudinary ref (needed only for PDF delivery/deletion) —
// never sent to clients, same pattern as CourseContent.publicId.
freeProductSchema.set('toJSON', {
  transform: (_doc, ret) => {
    const safeRet = ret as unknown as Record<string, unknown>;
    delete safeRet.publicId;
    delete safeRet.__v;
    return safeRet;
  },
});

export const FreeProduct = model<IFreeProduct>('FreeProduct', freeProductSchema);
