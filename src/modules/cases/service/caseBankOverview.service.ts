import cloudinary, { CloudinaryFolders, uploadBuffer } from '../../../config/cloudinary';
import { CaseBankOverview } from '../model/caseBankOverview.model';
import { UpdateCaseBankOverviewInput } from '../schema/caseBankOverview.schema';

// ─────────────────────────────────────────────────────────────────────────────
// Singleton accessor — there is always exactly one overview document.
// Upserts on first read so callers never have to handle a missing doc.
// ─────────────────────────────────────────────────────────────────────────────

const getOrCreateOverview = async () => {
  const overview = await CaseBankOverview.findOneAndUpdate(
    {},
    { $setOnInsert: {} },
    { returnDocument: 'after', upsert: true },
  );
  return overview!;
};

export const getCaseBankOverview = async () => {
  return getOrCreateOverview();
};

export const updateCaseBankOverview = async (input: UpdateCaseBankOverviewInput) => {
  const overview = await CaseBankOverview.findOneAndUpdate(
    {},
    { $set: input, $setOnInsert: {} },
    { returnDocument: 'after', upsert: true },
  );
  return overview!;
};

// Destroy-then-upload, same ordering rationale as Course.updateCourseThumbnail —
// if the new upload fails, the old image is already gone but no bad data has
// been written.
export const updateCaseBankOverviewImage = async (file: Express.Multer.File) => {
  await getOrCreateOverview();
  const existing = await CaseBankOverview.findOne({}).select('+imagePublicId');

  if (existing?.imagePublicId) {
    try {
      await cloudinary.uploader.destroy(existing.imagePublicId, { resource_type: 'image' });
    } catch (err) {
      console.error(`⚠️  Could not delete old case bank overview image (${existing.imagePublicId}):`, err);
    }
  }

  const result = await uploadBuffer(file.buffer, {
    folder: CloudinaryFolders.CASE_BANK_OVERVIEW,
    resource_type: 'image',
    use_filename: false,
    unique_filename: true,
    overwrite: false,
    // `limit` only ever scales down, never crops — nothing the admin uploaded is lost.
    transformation: [{ width: 1600, height: 1600, crop: 'limit' }],
  });

  const updated = await CaseBankOverview.findOneAndUpdate(
    {},
    { imageUrl: result.secure_url, imagePublicId: result.public_id },
    { returnDocument: 'after', upsert: true },
  );

  return updated!;
};
