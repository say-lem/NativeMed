import { Schema, model, Document, Types } from 'mongoose';

export interface IYoutubeLink {
  _id: Types.ObjectId;
  title: string;
  url: string;
  order: number;
}

// Singleton — one document holds every homepage stat/link. There is never
// more than one; see getSettings() in the service for the upsert-on-read.
export interface IHomepageSettings extends Document {
  _id: Types.ObjectId;
  testimonialsCount: number;
  registrarsCount: number;
  youtubeLinks: Types.DocumentArray<IYoutubeLink>;
  createdAt: Date;
  updatedAt: Date;
}

const youtubeLinkSchema = new Schema<IYoutubeLink>(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    url:   { type: String, required: true, trim: true },
    order: { type: Number, required: true, default: 0 },
  },
  { _id: true },
);

const homepageSettingsSchema = new Schema<IHomepageSettings>(
  {
    testimonialsCount: { type: Number, required: true, default: 0, min: 0 },
    registrarsCount:   { type: Number, required: true, default: 0, min: 0 },
    youtubeLinks:      { type: [youtubeLinkSchema], default: [] },
  },
  { timestamps: true },
);

export const HomepageSettings = model<IHomepageSettings>('HomepageSettings', homepageSettingsSchema);
