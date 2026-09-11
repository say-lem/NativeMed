import { AppError } from '../../../shared/utils/appError';
import { MockCase } from '../../cases/model/cases.model';
import { HomepageSettings } from '../model/homepage.model';
import {
  UpdateHomepageStatsInput,
  CreateYoutubeLinkInput,
  UpdateYoutubeLinkInput,
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
