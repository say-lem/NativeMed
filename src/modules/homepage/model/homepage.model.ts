import { Schema, model, Document, Types } from 'mongoose';

export interface IYoutubeLink {
  _id: Types.ObjectId;
  title: string;
  url: string;
  order: number;
}

export interface IFaq {
  _id: Types.ObjectId;
  question: string;
  answer: string;
  order: number;
}

// Singleton — one document holds every homepage stat/link. There is never
// more than one; see getSettings() in the service for the upsert-on-read.
export interface IHomepageSettings extends Document {
  _id: Types.ObjectId;
  testimonialsCount: number;
  registrarsCount: number;
  contactEmail?: string;
  contactPhone?: string;
  youtubeLinks: Types.DocumentArray<IYoutubeLink>;
  faqs: Types.DocumentArray<IFaq>;
  termsAndConditions: string;
  termsAndConditionsUpdatedAt?: Date;
  legalDisclaimer: string;
  legalDisclaimerUpdatedAt?: Date;
  privacyPolicy: string;
  privacyPolicyUpdatedAt?: Date;
  founderBio: string;
  founderBioUpdatedAt?: Date;
  founderTitle?: string;
  founderImageUrl?: string;
  founderImagePublicId?: string; // select:false — Cloudinary ref, used only for replace/delete
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

const faqSchema = new Schema<IFaq>(
  {
    question: { type: String, required: true, trim: true, maxlength: 500 },
    answer:   { type: String, required: true, trim: true, maxlength: 5000 },
    order:    { type: Number, required: true, default: 0 },
  },
  { _id: true },
);

const homepageSettingsSchema = new Schema<IHomepageSettings>(
  {
    testimonialsCount: { type: Number, required: true, default: 0, min: 0 },
    registrarsCount:   { type: Number, required: true, default: 0, min: 0 },
    contactEmail:      { type: String, trim: true, lowercase: true },
    contactPhone:      { type: String, trim: true },
    youtubeLinks:      { type: [youtubeLinkSchema], default: [] },
    faqs:              { type: [faqSchema], default: [] },
    // Tracked with its own timestamp — the document's own updatedAt also
    // shifts on stat/youtube-link edits, so it can't tell "when were terms
    // last edited" on its own. Same reasoning for legalDisclaimer/privacyPolicy/founderBio below.
    termsAndConditions:          { type: String, trim: true, default: '' },
    termsAndConditionsUpdatedAt: { type: Date },
    legalDisclaimer:             { type: String, trim: true, default: '' },
    legalDisclaimerUpdatedAt:    { type: Date },
    privacyPolicy:               { type: String, trim: true, default: '' },
    privacyPolicyUpdatedAt:      { type: Date },
    founderBio:                  { type: String, trim: true, default: '' },
    founderBioUpdatedAt:         { type: Date },
    // Title/qualification (e.g. "Founder & CEO, MBBS, MRCGP") and profile
    // photo — updated via the same founder-bio endpoint / its own image
    // upload endpoint (see updateFounderBio / updateFounderImage in the
    // service), bumping founderBioUpdatedAt as the "last edited" marker for
    // the whole founder section.
    founderTitle:         { type: String, trim: true, maxlength: 200 },
    founderImageUrl:      { type: String },
    founderImagePublicId: { type: String, select: false },
  },
  { timestamps: true },
);

// founderImagePublicId is an internal Cloudinary ref — never sent to clients,
// same pattern as Course.thumbnailPublicId.
homepageSettingsSchema.set('toJSON', {
  transform: (_doc, ret) => {
    const safeRet = ret as unknown as Record<string, unknown>;
    delete safeRet.founderImagePublicId;
    delete safeRet.__v;
    return safeRet;
  },
});

export const HomepageSettings = model<IHomepageSettings>('HomepageSettings', homepageSettingsSchema);
