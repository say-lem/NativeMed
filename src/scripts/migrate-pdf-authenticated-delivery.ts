/**
 * One-time migration: Cloudinary now blocks unsigned delivery of PDF/ZIP
 * files by default. Every existing course PDF was uploaded as the public
 * "upload" delivery type, so their stored fileUrl either 401s outright (if
 * the URL happens to end in .pdf) or serves with the wrong content-type
 * (if it doesn't).
 *
 * Fix: move each PDF asset to Cloudinary's "authenticated" delivery type via
 * uploader.rename's `to_type` — this re-points the existing asset without
 * re-uploading the file bytes — then store the resulting secure_url (which
 * is a permanently-valid signed URL) back on the CourseContent record.
 *
 * New uploads already go straight to type: 'authenticated'
 * (see content.service.ts uploadPdf) — this script is only for content
 * created before that change.
 *
 * Usage: npx ts-node -r dotenv/config src/scripts/migrate-pdf-authenticated-delivery.ts
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

if (!process.env.MONGO_URI) {
  console.error('❌  MONGO_URI is not set');
  process.exit(1);
}

const main = async () => {
  console.log('🔌  Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGO_URI!);
  console.log('✅  Connected\n');

  const cloudinary = (await import('../config/cloudinary')).default;
  const { CourseContent } = await import('../modules/content/model/content.model');

  const pdfs = await CourseContent.find({ type: 'pdf' }).select('+publicId');
  console.log(`Found ${pdfs.length} PDF content record(s)\n`);

  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  for (const content of pdfs) {
    if (!content.publicId) {
      console.log(`⚠️   Skipping "${content.title}" — no publicId stored`);
      skipped++;
      continue;
    }

    try {
      const renamed = await cloudinary.uploader.rename(content.publicId, content.publicId, {
        resource_type: 'raw',
        type: 'upload',
        to_type: 'authenticated',
        overwrite: true,
      });

      await CourseContent.findByIdAndUpdate(content._id, { fileUrl: renamed.secure_url });

      console.log(`✅  ${content.title}`);
      console.log(`     old: ${content.fileUrl}`);
      console.log(`     new: ${renamed.secure_url}\n`);
      migrated++;
    } catch (err: any) {
      // "Resource not found" typically means it's already been migrated
      // (no longer exists under type: upload) — safe to skip on a re-run.
      if (err?.error?.http_code === 404 || err?.http_code === 404) {
        console.log(`↷  Skipping "${content.title}" — already migrated (not found under type: upload)\n`);
        skipped++;
      } else {
        console.error(`❌  Failed to migrate "${content.title}":`, err?.message ?? err, '\n');
        failed++;
      }
    }
  }

  console.log(`\n✅  Migrated: ${migrated}  ↷ Skipped: ${skipped}  ❌ Failed: ${failed}`);

  await mongoose.disconnect();
};

main().catch((err) => {
  console.error('\n❌  Migration failed:', err);
  mongoose.disconnect().finally(() => process.exit(1));
});
