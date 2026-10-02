import { AppError } from '../../../shared/utils/appError';
import { MockCase } from '../../cases/model/cases.model';
import cloudinary, { CloudinaryFolders, uploadBuffer } from '../../../config/cloudinary';
import { HomepageSettings } from '../model/homepage.model';
import {
  UpdateHomepageStatsInput,
  CreateYoutubeLinkInput,
  UpdateYoutubeLinkInput,
  CreateFaqInput,
  UpdateFaqInput,
  UpdateTermsAndConditionsInput,
  UpdateLegalDisclaimerInput,
  UpdatePrivacyPolicyInput,
  UpdateFounderBioInput,
} from '../schema/homepage.schema';

// ─────────────────────────────────────────────────────────────────────────────
// Singleton accessor — there is always exactly one settings document.
// Upserts on first read so callers never have to handle a missing doc.
// ─────────────────────────────────────────────────────────────────────────────

const getOrCreateSettings = async () => {
  const settings = await HomepageSettings.findOneAndUpdate(
    {},
    { $setOnInsert: {} },
    { returnDocument: 'after', upsert: true },
  );
  return settings!;
};

// caseNumber is never stored — it's always the live published-case count,
// so admin-entered stats can never drift from what /cases actually shows.
const getCaseNumber = () => MockCase.countDocuments({ isPublished: true });

// ─────────────────────────────────────────────────────────────────────────────
// Public — homepage feed
// ─────────────────────────────────────────────────────────────────────────────

export const getHomepageData = async () => {
  const [settings, caseNumber] = await Promise.all([getOrCreateSettings(), getCaseNumber()]);
  return {
    caseNumber,
    testimonialsCount: settings.testimonialsCount,
    registrarsCount: settings.registrarsCount,
    contactEmail: settings.contactEmail ?? null,
    contactPhone: settings.contactPhone ?? null,
    facebookUrl: settings.facebookUrl ?? null,
    whatsappUrl: settings.whatsappUrl ?? null,
    twitterUrl: settings.twitterUrl ?? null,
    instagramUrl: settings.instagramUrl ?? null,
    youtubeUrl: settings.youtubeUrl ?? null,
    youtubeLinks: [...settings.youtubeLinks].sort((a, b) => a.order - b.order),
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Admin — stats
// ─────────────────────────────────────────────────────────────────────────────

export const updateHomepageStats = async (input: UpdateHomepageStatsInput) => {
  const settings = await HomepageSettings.findOneAndUpdate(
    {},
    { $set: input, $setOnInsert: {} },
    { returnDocument: 'after', upsert: true },
  );
  return settings!;
};

// ─────────────────────────────────────────────────────────────────────────────
// Admin — YouTube links (managed list on the singleton document)
// ─────────────────────────────────────────────────────────────────────────────

export const addYoutubeLink = async (input: CreateYoutubeLinkInput) => {
  const settings = await getOrCreateSettings();
  settings.youtubeLinks.push({ order: 0, ...input });
  await settings.save();
  return settings;
};

export const updateYoutubeLink = async (linkId: string, input: UpdateYoutubeLinkInput) => {
  const settings = await getOrCreateSettings();
  const link = settings.youtubeLinks.id(linkId);
  if (!link) throw new AppError('YouTube link not found', 404);

  Object.assign(link, input);
  await settings.save();

  return settings;
};

export const deleteYoutubeLink = async (linkId: string) => {
  const settings = await getOrCreateSettings();
  const link = settings.youtubeLinks.id(linkId);
  if (!link) throw new AppError('YouTube link not found', 404);

  settings.youtubeLinks.pull(linkId);
  await settings.save();

  return settings;
};

// ─────────────────────────────────────────────────────────────────────────────
// Public / Admin — FAQ list (managed on the singleton document, open to read)
// ─────────────────────────────────────────────────────────────────────────────

export const getFaqs = async () => {
  const settings = await getOrCreateSettings();
  return [...settings.faqs].sort((a, b) => a.order - b.order);
};

export const addFaq = async (input: CreateFaqInput) => {
  const settings = await getOrCreateSettings();
  settings.faqs.push({ order: 0, ...input });
  await settings.save();
  return settings;
};

export const updateFaq = async (faqId: string, input: UpdateFaqInput) => {
  const settings = await getOrCreateSettings();
  const faq = settings.faqs.id(faqId);
  if (!faq) throw new AppError('FAQ not found', 404);

  Object.assign(faq, input);
  await settings.save();

  return settings;
};

export const deleteFaq = async (faqId: string) => {
  const settings = await getOrCreateSettings();
  const faq = settings.faqs.id(faqId);
  if (!faq) throw new AppError('FAQ not found', 404);

  settings.faqs.pull(faqId);
  await settings.save();

  return settings;
};

// ─────────────────────────────────────────────────────────────────────────────
// Terms and conditions — own endpoint, same singleton document underneath.
// The first PATCH creates it, every later PATCH edits it in place — there's
// no separate "create" step to keep in sync with "edit".
// ─────────────────────────────────────────────────────────────────────────────

export const getTermsAndConditions = async () => {
  const settings = await getOrCreateSettings();
  return {
    content: settings.termsAndConditions,
    updatedAt: settings.termsAndConditionsUpdatedAt ?? null,
  };
};

export const updateTermsAndConditions = async (input: UpdateTermsAndConditionsInput) => {
  const settings = await HomepageSettings.findOneAndUpdate(
    {},
    {
      $set: { termsAndConditions: input.content, termsAndConditionsUpdatedAt: new Date() },
      $setOnInsert: {},
    },
    { returnDocument: 'after', upsert: true },
  );
  return {
    content: settings!.termsAndConditions,
    updatedAt: settings!.termsAndConditionsUpdatedAt ?? null,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Legal disclaimer — own endpoint, same pattern/singleton as terms above.
// ─────────────────────────────────────────────────────────────────────────────

export const getLegalDisclaimer = async () => {
  const settings = await getOrCreateSettings();
  return {
    content: settings.legalDisclaimer,
    updatedAt: settings.legalDisclaimerUpdatedAt ?? null,
  };
};

export const updateLegalDisclaimer = async (input: UpdateLegalDisclaimerInput) => {
  const settings = await HomepageSettings.findOneAndUpdate(
    {},
    {
      $set: { legalDisclaimer: input.content, legalDisclaimerUpdatedAt: new Date() },
      $setOnInsert: {},
    },
    { returnDocument: 'after', upsert: true },
  );
  return {
    content: settings!.legalDisclaimer,
    updatedAt: settings!.legalDisclaimerUpdatedAt ?? null,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Privacy policy — own endpoint, same pattern/singleton as terms above.
// ─────────────────────────────────────────────────────────────────────────────

export const getPrivacyPolicy = async () => {
  const settings = await getOrCreateSettings();
  return {
    content: settings.privacyPolicy,
    updatedAt: settings.privacyPolicyUpdatedAt ?? null,
  };
};

export const updatePrivacyPolicy = async (input: UpdatePrivacyPolicyInput) => {
  const settings = await HomepageSettings.findOneAndUpdate(
    {},
    {
      $set: { privacyPolicy: input.content, privacyPolicyUpdatedAt: new Date() },
      $setOnInsert: {},
    },
    { returnDocument: 'after', upsert: true },
  );
  return {
    content: settings!.privacyPolicy,
    updatedAt: settings!.privacyPolicyUpdatedAt ?? null,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Founder's bio — own endpoint, same pattern/singleton as terms above.
// ─────────────────────────────────────────────────────────────────────────────

export const getFounderBio = async () => {
  const settings = await getOrCreateSettings();
  return {
    content: settings.founderBio,
    title: settings.founderTitle ?? null,
    imageUrl: settings.founderImageUrl ?? null,
    updatedAt: settings.founderBioUpdatedAt ?? null,
  };
};

export const updateFounderBio = async (input: UpdateFounderBioInput) => {
  const setFields: Record<string, unknown> = { founderBioUpdatedAt: new Date() };
  if (input.content !== undefined) setFields.founderBio = input.content;
  if (input.title !== undefined) setFields.founderTitle = input.title;

  const settings = await HomepageSettings.findOneAndUpdate(
    {},
    { $set: setFields, $setOnInsert: {} },
    { returnDocument: 'after', upsert: true },
  );
  return {
    content: settings!.founderBio,
    title: settings!.founderTitle ?? null,
    imageUrl: settings!.founderImageUrl ?? null,
    updatedAt: settings!.founderBioUpdatedAt ?? null,
  };
};

// Destroy-then-upload, same ordering rationale as Course.updateCourseThumbnail —
// if the new upload fails, the old image is already gone but no bad data has
// been written.
export const updateFounderImage = async (file: Express.Multer.File) => {
  await getOrCreateSettings();
  const existing = await HomepageSettings.findOne({}).select('+founderImagePublicId');

  if (existing?.founderImagePublicId) {
    try {
      await cloudinary.uploader.destroy(existing.founderImagePublicId, { resource_type: 'image' });
    } catch (err) {
      console.error(`⚠️  Could not delete old founder image (${existing.founderImagePublicId}):`, err);
    }
  }

  const result = await uploadBuffer(file.buffer, {
    folder: CloudinaryFolders.FOUNDER_IMAGES,
    resource_type: 'image',
    use_filename: false,
    unique_filename: true,
    overwrite: false,
    // `limit` only ever scales down, never crops — nothing the admin uploaded is lost.
    transformation: [{ width: 800, height: 800, crop: 'limit' }],
  });

  const updated = await HomepageSettings.findOneAndUpdate(
    {},
    { founderImageUrl: result.secure_url, founderImagePublicId: result.public_id },
    { returnDocument: 'after', upsert: true },
  );

  return updated!;
};
