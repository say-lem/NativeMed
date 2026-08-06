/**
 * upload-station-images.ts
 * One-shot script: uploads station images from /images to Cloudinary
 * and patches the matching entries in cases-seed.json with the returned URLs.
 *
 * Usage:  npx ts-node -r dotenv/config src/scripts/upload-station-images.ts
 */

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { v2 as cloudinary } from 'cloudinary';

dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
  api_key:    process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
});

const IMAGES_DIR  = path.resolve(__dirname, '../../images');
const SEED_PATH   = path.resolve(__dirname, 'cases-seed.json');
const FOLDER      = 'native-med/cases/station-images';

async function run() {
  const imageFiles = fs.readdirSync(IMAGES_DIR).filter((f) =>
    /\.(jpe?g|png|webp)$/i.test(f),
  );

  const seedData: Record<string, unknown>[] = JSON.parse(
    fs.readFileSync(SEED_PATH, 'utf-8'),
  );

  console.log(`\n📂  Found ${imageFiles.length} image(s) in ${IMAGES_DIR}\n`);

  for (const filename of imageFiles) {
    const match = filename.match(/^station_(\d+)_image\./i);
    if (!match) {
      console.warn(`⚠️   Skipping unrecognised filename: ${filename}`);
      continue;
    }

    const stationNumber = parseInt(match[1], 10);
    const caseIndex     = seedData.findIndex((c) => c.stationNumber === stationNumber);

    if (caseIndex === -1) {
      console.warn(`⚠️   No case found for station ${stationNumber} — skipping`);
      continue;
    }

    const filePath = path.join(IMAGES_DIR, filename);
    process.stdout.write(`  ⬆️   Station ${String(stationNumber).padStart(3)}: uploading…`);

    try {
      const result = await cloudinary.uploader.upload(filePath, {
        folder: FOLDER,
        resource_type:   'image',
        use_filename:    false,
        unique_filename: true,
        overwrite:       false,
        context:         `station_number=${stationNumber}`,
        transformation: [{ width: 800, height: 600, crop: 'fill', gravity: 'auto' }],
      });

      (seedData[caseIndex] as Record<string, unknown>).stationImageUrl      = result.secure_url;
      (seedData[caseIndex] as Record<string, unknown>).stationImagePublicId = result.public_id;

      console.log(` ✅  ${result.secure_url}`);
    } catch (err) {
      console.log(` ❌  FAILED`);
      console.error('      ', err instanceof Error ? err.message : err);
    }
  }

  fs.writeFileSync(SEED_PATH, JSON.stringify(seedData, null, 2));
  console.log('\n✔   cases-seed.json updated\n');
}

run().catch((err) => {
  console.error('\n❌  Script crashed:', err);
  process.exit(1);
});
