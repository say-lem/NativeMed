import { Types } from 'mongoose';
import { AppError } from '../../../shared/utils/appError';
import { UserRole } from '../../../shared/types';
import {
  hasCaseBankAccess,
  notifyCaseBankSubscribersCaseAdded,
  notifyCaseBankSubscribersCaseUpdated,
} from '../../subscriptions/service/subscriptions.service';
import { MockCase } from '../model/cases.model';
import { CreateCaseInput, UpdateCaseInput, CaseFilterInput } from '../schema/cases.schema';
import cloudinary, { CloudinaryFolders, uploadBuffer } from '../../../config/cloudinary';

/**
 * Build a Mongoose filter object from the validated query params.
 * isPublished is injected by the caller so admins and users get different views.
 */
const buildFilter = (
  params: CaseFilterInput,
  isPublished?: boolean,
): Record<string, unknown> => {
  const filter: Record<string, unknown> = {};

  if (typeof isPublished === 'boolean') filter.isPublished = isPublished;
  if (params.specialty)  filter.specialty  = { $regex: escapeRegex(params.specialty), $options: 'i' };
  if (params.difficulty) filter.difficulty = params.difficulty;

  if (params.search) {
    // Prefer MongoDB full-text search when a text index is available.
    // Falls back to a regex title scan if the index hasn't been built yet.
    filter.$text = { $search: params.search };
  }

  return filter;
};

const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Published cases visible without a Case Bank subscription (by station order). */
const FREE_CASE_PREVIEW_LIMIT = 5;

const hasFullCaseBankAccess = async (
  userId?: Types.ObjectId,
  role?: UserRole,
): Promise<boolean> => {
  // Anonymous visitor — same treatment as an unsubscribed logged-in user:
  // free-preview cases only.
  if (!userId || !role) return false;
  if (role === 'admin') return true;
  return hasCaseBankAccess(userId);
};

const getFreePreviewCaseIds = async (): Promise<Types.ObjectId[]> => {
  const cases = await MockCase.find({ isPublished: true })
    .sort({ stationNumber: 1, createdAt: -1 })
    .limit(FREE_CASE_PREVIEW_LIMIT)
    .select('_id')
    .lean();
  return cases.map((c) => c._id);
};

const applyCaseBankAccessFilter = async (
  filter: Record<string, unknown>,
  userId?: Types.ObjectId,
  role?: UserRole,
): Promise<Record<string, unknown>> => {
  if (await hasFullCaseBankAccess(userId, role)) return filter;
  const freeIds = await getFreePreviewCaseIds();
  return { ...filter, _id: { $in: freeIds } };
};

const assertCaseDetailAccess = async (
  caseId: string,
  userId?: Types.ObjectId,
  role?: UserRole,
): Promise<void> => {
  if (await hasFullCaseBankAccess(userId, role)) return;
  const freeIds = await getFreePreviewCaseIds();
  const allowed = freeIds.some((id) => id.toString() === caseId);
  if (!allowed) {
    throw new AppError(
      'This case requires a Case Bank subscription. Subscribe to access the full case library.',
      403,
    );
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Public / user — published cases only
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Paginated list of published cases.
 * Returns a lightweight projection — no patientStory, no markingScheme etc.
 * The heavy content is only fetched on the detail view to keep list responses small.
 * Non-subscribers only see the first {FREE_CASE_PREVIEW_LIMIT} cases by station number.
 */

export const getPublishedCases = async (
  params: CaseFilterInput,
  userId?: Types.ObjectId,
  role?: UserRole,
) => {
  const baseFilter = buildFilter(params, true);
  const filter = await applyCaseBankAccessFilter(baseFilter, userId, role);
  const { page, limit } = params;

  const projection = {
    stationNumber: 1,
    title: 1,
    specialty: 1,
    difficulty: 1,
    imageUrl: 1,
    'patientData.name': 1,
    'patientData.age': 1,
    'patientData.gender': 1,
    createdAt: 1,
  };

  const [items, total] = await Promise.all([
    MockCase.find(filter, projection)
      .sort({ stationNumber: 1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    MockCase.countDocuments(filter),
  ]);

  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
};

/**
 * Full case detail — all sections included.
 * Only returns published cases to regular users.
 */
export const getPublishedCaseById = async (
  caseId: string,
  userId?: Types.ObjectId,
  role?: UserRole,
) => {
  await assertCaseDetailAccess(caseId, userId, role);
  const mockCase = await MockCase.findOne({ _id: caseId, isPublished: true });
  if (!mockCase) throw new AppError('Case not found', 404);
  return mockCase;
};

/**
 * Distinct specialty values from published cases — used to populate
 * the specialty filter dropdown on the frontend.
 */
export interface PublishedSpecialtyCount {
  specialty: string;
  count: number;
}

export const getPublishedSpecialties = async (
  userId?: Types.ObjectId,
  role?: UserRole,
): Promise<PublishedSpecialtyCount[]> => {
  const match: Record<string, unknown> = { isPublished: true };
  if (!(await hasFullCaseBankAccess(userId, role))) {
    match._id = { $in: await getFreePreviewCaseIds() };
  }

  const rows = await MockCase.aggregate<{ _id: string; count: number }>([
    { $match: match },
    { $group: { _id: '$specialty', count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);

  return rows.map((r) => ({
    specialty: r._id,
    count: r.count,
  }));
};

export const getCasesBySpecialty = async (
  specialty: string,
  params: CaseFilterInput,
  userId?: Types.ObjectId,
  role?: UserRole,
) => {
  const scopedParams: CaseFilterInput = { ...params, specialty };
  return getPublishedCases(scopedParams, userId, role);
};

// ─────────────────────────────────────────────────────────────────────────────
// Admin — full access (published + drafts)
// ─────────────────────────────────────────────────────────────────────────────

export const createCase = async (
  input: CreateCaseInput,
  adminId: Types.ObjectId,
  imageFile?: Express.Multer.File,
  stationImageFile?: Express.Multer.File,
) => {
  const mockCase = await MockCase.create({ ...input, createdBy: adminId });
  const id = mockCase._id.toString();

  if (imageFile) await updateCaseImage(id, imageFile);
  if (stationImageFile) await updateCaseStationImage(id, stationImageFile);

  const result = imageFile || stationImageFile ? await MockCase.findById(id) : mockCase;

  if (result?.isPublished) {
    void notifyCaseBankSubscribersCaseAdded(result.stationNumber, result.title, result.specialty);
  }

  return result;
};

/**
 * Upload or replace the optional cover image for a case.
 */
export const updateCaseImage = async (
  caseId: string,
  file: Express.Multer.File,
) => {
  const mockCase = await MockCase.findById(caseId).select('+imagePublicId');
  if (!mockCase) throw new AppError('Case not found', 404);

  if (mockCase.imagePublicId) {
    try {
      await cloudinary.uploader.destroy(mockCase.imagePublicId, {
        resource_type: 'image',
      });
    } catch (err) {
      console.error(
        `⚠️  Could not delete old case image (${mockCase.imagePublicId}):`,
        err,
      );
    }
  }

  const result = await uploadBuffer(file.buffer, {
    folder: CloudinaryFolders.CASE_IMAGES,
    resource_type: 'image',
    use_filename: false,
    unique_filename: true,
    overwrite: false,
    transformation: [{ width: 800, height: 450, crop: 'fill', gravity: 'auto' }],
  });

  const updated = await MockCase.findByIdAndUpdate(
    caseId,
    {
      imageUrl: result.secure_url,
      imagePublicId: result.public_id,
    },
    { new: true },
  );

  if (!updated) throw new AppError('Case not found', 404);
  return updated;
};

/**
 * Upload or replace the optional station image for a case.
 */
export const updateCaseStationImage = async (
  caseId: string,
  file: Express.Multer.File,
) => {
  const mockCase = await MockCase.findById(caseId).select('+stationImagePublicId');
  if (!mockCase) throw new AppError('Case not found', 404);

  if (mockCase.stationImagePublicId) {
    try {
      await cloudinary.uploader.destroy(mockCase.stationImagePublicId, {
        resource_type: 'image',
      });
    } catch (err) {
      console.error(
        `⚠️  Could not delete old station image (${mockCase.stationImagePublicId}):`,
        err,
      );
    }
  }

  const result = await uploadBuffer(file.buffer, {
    folder: CloudinaryFolders.CASE_STATION_IMAGES,
    resource_type: 'image',
    use_filename: false,
    unique_filename: true,
    overwrite: false,
    transformation: [{ width: 800, height: 600, crop: 'fill', gravity: 'auto' }],
  });

  const updated = await MockCase.findByIdAndUpdate(
    caseId,
    {
      stationImageUrl: result.secure_url,
      stationImagePublicId: result.public_id,
    },
    { new: true },
  );

  if (!updated) throw new AppError('Case not found', 404);
  return updated;
};

/**
 * Admin list — includes drafts (isPublished: false).
 * Returns the same lightweight projection as the public list.
 */
export const getAllCasesAdmin = async (params: CaseFilterInput) => {
  // No isPublished filter — admins see everything
  const filter = buildFilter(params);
  const { page, limit } = params;

  const [items, total] = await Promise.all([
    MockCase.find(filter)
      .select('-patientStory -markingScheme -exampleExplanation -management -learningPoints -furtherResources')
      .sort({ stationNumber: 1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('createdBy', 'fullName email'),
    MockCase.countDocuments(filter),
  ]);

  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
};

/**
 * Admin full case detail — returns drafts too.
 */
export const getCaseByIdAdmin = async (caseId: string) => {
  const mockCase = await MockCase
    .findById(caseId)
    .populate('createdBy', 'fullName email');
  if (!mockCase) throw new AppError('Case not found', 404);
  return mockCase;
};

/**
 * Partial update — only the supplied fields are overwritten.
 * For nested patientData we do a targeted merge using dot-notation so
 * a patch of { patientData: { age: 41 } } doesn't wipe the entire sub-document.
 */
export const updateCase = async (caseId: string, input: UpdateCaseInput) => {
  const previous = await MockCase.findById(caseId).select('isPublished');
  if (!previous) throw new AppError('Case not found', 404);

  // Flatten patientData into dot-notation keys so Mongoose $set merges correctly
  const updatePayload: Record<string, unknown> = {};

  const { patientData, ...rest } = input;

  // Top-level fields go in as-is
  Object.entries(rest).forEach(([key, value]) => {
    if (value !== undefined) updatePayload[key] = value;
  });

  // Nested patientData fields use dot-notation to avoid wiping sibling fields
  if (patientData) {
    Object.entries(patientData).forEach(([key, value]) => {
      if (value !== undefined) updatePayload[`patientData.${key}`] = value;
    });
  }

  const updated = await MockCase.findByIdAndUpdate(
    caseId,
    { $set: updatePayload },
    { new: true, runValidators: true },
  );

  if (!updated) throw new AppError('Case not found', 404);

  if (updated.isPublished) {
    if (previous.isPublished) {
      void notifyCaseBankSubscribersCaseUpdated(updated.stationNumber, updated.title, updated.specialty);
    } else {
      void notifyCaseBankSubscribersCaseAdded(updated.stationNumber, updated.title, updated.specialty);
    }
  }

  return updated;
};

export const deleteCase = async (caseId: string): Promise<void> => {
  const mockCase = await MockCase.findById(caseId).select('+imagePublicId +stationImagePublicId');
  if (!mockCase) throw new AppError('Case not found', 404);

  const destroyPromises: Promise<unknown>[] = [];

  if (mockCase.imagePublicId) {
    destroyPromises.push(
      cloudinary.uploader
        .destroy(mockCase.imagePublicId, { resource_type: 'image' })
        .catch((err) =>
          console.error(`⚠️  Could not delete case image (${mockCase.imagePublicId}):`, err),
        ),
    );
  }

  if (mockCase.stationImagePublicId) {
    destroyPromises.push(
      cloudinary.uploader
        .destroy(mockCase.stationImagePublicId, { resource_type: 'image' })
        .catch((err) =>
          console.error(`⚠️  Could not delete station image (${mockCase.stationImagePublicId}):`, err),
        ),
    );
  }

  await Promise.all(destroyPromises);
  await MockCase.findByIdAndDelete(caseId);
};

/**
 * Toggle published state — publishes a draft or unpublishes a live case.
 */
export const togglePublish = async (caseId: string) => {
  const mockCase = await MockCase.findById(caseId);
  if (!mockCase) throw new AppError('Case not found', 404);

  mockCase.isPublished = !mockCase.isPublished;
  await mockCase.save();

  if (mockCase.isPublished) {
    void notifyCaseBankSubscribersCaseAdded(mockCase.stationNumber, mockCase.title, mockCase.specialty);
  }

  return {
    _id: mockCase._id,
    title: mockCase.title,
    isPublished: mockCase.isPublished,
  };
};

/**
 * Duplicate a case — creates a draft copy with "Copy of" prefix and
 * the next available station number so it doesn't collide.
 */
export const duplicateCase = async (
  caseId: string,
  adminId: Types.ObjectId,
) => {
  const source = await MockCase.findById(caseId).lean();
  if (!source) throw new AppError('Case not found', 404);

  // Find the highest existing station number and increment
  const last = await MockCase.findOne().sort({ stationNumber: -1 }).select('stationNumber');
  const nextStation = (last?.stationNumber ?? 0) + 1;

  const {
    _id,
    createdAt,
    updatedAt,
    __v,
    imageUrl: _imageUrl,
    imagePublicId: _imagePublicId,
    stationImageUrl: _stationImageUrl,
    stationImagePublicId: _stationImagePublicId,
    ...caseData
  } = source as typeof source & {
    __v?: number;
    createdAt?: Date;
    updatedAt?: Date;
    imageUrl?: string;
    imagePublicId?: string;
    stationImageUrl?: string;
    stationImagePublicId?: string;
  };

  return MockCase.create({
    ...caseData,
    title: `Copy of ${source.title}`,
    stationNumber: nextStation,
    isPublished: false,  // duplicates are always drafts
    createdBy: adminId,
  });
};