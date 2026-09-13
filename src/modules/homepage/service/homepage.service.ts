import { AppError } from '../../../shared/utils/appError';
import { MockCase } from '../../cases/model/cases.model';
import { HomepageSettings } from '../model/homepage.model';
import {
  UpdateHomepageStatsInput,
  CreateYoutubeLinkInput,
  UpdateYoutubeLinkInput,
  UpdateTermsAndConditionsInput,
  UpdateLegalDisclaimerInput,
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
