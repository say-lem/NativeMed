/**
 * restore-station-images.ts
 * -------------------------
 * Fetches station images already uploaded to Cloudinary, matches them to
 * cases by original filename (e.g. station_20_image.jpg → station 20),
 * writes the URLs into cases-seed.json, and patches MongoDB.
 *
 * Run this after regenerating cases-seed.json from the docx parser, or any
 * time stationImageUrl fields were lost during seeding.
 *
 * Usage:
 *   npm run restore:station-images              # update JSON + DB
 *   npm run restore:station-images -- --json-only # update JSON only
 *
 * Requires CLOUDINARY_* and MONGO_URI in .env
 */

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { v2 as cloudinary } from 'cloudinary';

dotenv.config();

const SEED_PATH = path.resolve(__dirname, 'cases-seed.json');
const FOLDER    = 'native-med/cases/station-images';
const STATION_FILENAME_RE = /^station_(\d+)_image(?:\.\w+)?$/i;

const jsonOnly = process.argv.includes('--json-only');

if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
  console.error('❌  CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET are required');
  process.exit(1);
}

if (!jsonOnly && !process.env.MONGO_URI) {
  console.error('❌  MONGO_URI is required (or pass --json-only to skip DB updates)');
  process.exit(1);
}

if (!fs.existsSync(SEED_PATH)) {
  console.error(`❌  Seed file not found: ${SEED_PATH}`);
  process.exit(1);
}

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

type CloudinaryResource = {
  public_id: string;
  secure_url: string;
  original_filename?: string;
  context?: Record<string, string>;
};

async function listStationImages(): Promise<CloudinaryResource[]> {
  const all: CloudinaryResource[] = [];
  let nextCursor: string | undefined;

  do {
    const page = await cloudinary.api.resources({
      type: 'upload',
      prefix: FOLDER,
      max_results: 500,
      next_cursor: nextCursor,
    });

    for (const resource of page.resources) {
      const details = await cloudinary.api.resource(resource.public_id, {
        image_metadata: true,
      });
      all.push({
        public_id: details.public_id,
        secure_url: details.secure_url,
        original_filename: details.original_filename,
        context: details.context?.custom,
      });
    }

    nextCursor = page.next_cursor;
  } while (nextCursor);

  return all;
}

function stationFromFilename(filename: string | undefined): number | null {
  if (!filename) return null;
  const match = filename.match(STATION_FILENAME_RE);
  return match ? parseInt(match[1], 10) : null;
}

function stationFromContext(context: Record<string, string> | undefined): number | null {
  const raw = context?.station_number;
  if (!raw) return null;
  const num = parseInt(raw, 10);
  return Number.isFinite(num) ? num : null;
}

async function run() {
  console.log(`\n☁️   Listing images in Cloudinary folder: ${FOLDER}\n`);

  const images = await listStationImages();
  console.log(`    Found ${images.length} image(s)\n`);

  const seedData: Record<string, unknown>[] = JSON.parse(
    fs.readFileSync(SEED_PATH, 'utf-8'),
  );

  const stationIndex = new Map<number, number>();
  seedData.forEach((entry, index) => {
    const num = entry.stationNumber as number;
    if (typeof num === 'number') stationIndex.set(num, index);
  });

  let jsonUpdated = 0;
  let skipped = 0;
  const matched: Array<{ station: number; url: string }> = [];

  for (const image of images) {
    const stationNumber =
      stationFromFilename(image.original_filename) ??
      stationFromContext(image.context);

    if (stationNumber === null) {
      console.warn(`⚠️   Could not parse station from "${image.original_filename ?? image.public_id}" — skipping`);
      skipped++;
      continue;
    }

    const caseIndex = stationIndex.get(stationNumber);
    if (caseIndex === undefined) {
      console.warn(`⚠️   No case for station ${stationNumber} — skipping`);
      skipped++;
      continue;
    }

    (seedData[caseIndex] as Record<string, unknown>).stationImageUrl      = image.secure_url;
    (seedData[caseIndex] as Record<string, unknown>).stationImagePublicId = image.public_id;

    matched.push({ station: stationNumber, url: image.secure_url });
    jsonUpdated++;
    console.log(`  ✅  Station ${String(stationNumber).padStart(3)} ← ${image.original_filename}`);
  }

  fs.writeFileSync(SEED_PATH, JSON.stringify(seedData, null, 2));
  console.log(`\n📝  cases-seed.json updated (${jsonUpdated} station image(s))`);

  if (jsonOnly) {
    console.log('\n✔   Done (JSON only — DB not updated)\n');
    return;
  }

  console.log('\n🔌  Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGO_URI!);
  const { MockCase } = await import('../modules/cases/model/cases.model');

  let dbUpdated = 0;
  for (const { station, url } of matched) {
    const entry = seedData[stationIndex.get(station)!] as Record<string, unknown>;
    const result = await MockCase.updateOne(
      { stationNumber: station },
      {
        $set: {
          stationImageUrl: url,
          stationImagePublicId: entry.stationImagePublicId,
        },
      },
    );
    if (result.matchedCount) dbUpdated++;
  }

  await mongoose.disconnect();

  console.log(`💾  MongoDB updated (${dbUpdated} case(s))`);
  if (skipped) console.log(`⚠️   Skipped ${skipped} image(s)`);
  console.log('\n✔   Done\n');
}

run().catch((err) => {
  console.error('\n❌  Script crashed:', err);
  mongoose.disconnect().finally(() => process.exit(1));
});
