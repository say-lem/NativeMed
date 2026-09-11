import { Schema, model, Document, Types } from 'mongoose';

export type FreeProductType = 'link' | 'pdf' | 'blog';

export interface IFreeProduct extends Document {
  _id: Types.ObjectId;
  title: string;
  description?: string;
  type: FreeProductType;
  fileUrl?: string;           // external link (type: link) or Cloudinary secure_url (type: pdf, not used for delivery — see service)
  publicId: string;           // Cloudinary public ID — select:false, only set for type: pdf, used for delivery + deletion
  content?: string;           // blog body (type: blog only)
  coverImageUrl?: string;     // Cloudinary secure_url (type: blog only) — public, delivered as-is
  coverImagePublicId: string; // Cloudinary public ID — select:false, only set for type: blog, used for replace/delete
  isPublished: boolean;
  order: number;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// Most free content is expected to be `blog` — `link`/`pdf` remain for the
// minority that's just a pointer to material rather than written content.
const freeProductSchema = new Schema<IFreeProduct>(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    // Required for link/pdf (the short blurb next to the material); optional
    // for blog, which carries its own written content instead.
    description: {
      type: String,
      trim: true,
      maxlength: 2000,
      required: function (this: IFreeProduct) { return this.type !== 'blog'; },
    },
    type: { type: String, enum: ['link', 'pdf', 'blog'], required: true },
    fileUrl: {
      type: String,
      required: function (this: IFreeProduct) { return this.type === 'link' || this.type === 'pdf'; },
    },
    publicId: { type: String, select: false, default: '' },
    content: {
      type: String,
      trim: true,
      maxlength: 20000,
      required: function (this: IFreeProduct) { return this.type === 'blog'; },
    },
    coverImageUrl: {
      type: String,
      required: function (this: IFreeProduct) { return this.type === 'blog'; },
    },
    coverImagePublicId: { type: String, select: false, default: '' },
    isPublished: { type: Boolean, default: true },
    order:       { type: Number, required: true, default: 0 },
    createdBy:   { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

// Public feed — published items, ordered for display
freeProductSchema.index({ isPublished: 1, order: 1 });

// publicId/coverImagePublicId are internal Cloudinary refs (needed only for
// delivery/replace/deletion) — never sent to clients, same pattern as
// CourseContent.publicId.
freeProductSchema.set('toJSON', {
  transform: (_doc, ret) => {
    const safeRet = ret as unknown as Record<string, unknown>;
    delete safeRet.publicId;
    delete safeRet.coverImagePublicId;
    delete safeRet.__v;
    return safeRet;
  },
});

export const FreeProduct = model<IFreeProduct>('FreeProduct', freeProductSchema);
