/**
 * seed-course.ts
 * --------------
 * Seeds one dummy published course using assets from /dummy course:
 *   - test.jpg              → course thumbnail (Cloudinary)
 *   - *.pdf                 → course PDF content (Cloudinary)
 *
 * Pre-requisites:
 *   1. MONGO_URI + Cloudinary vars set in .env
 *   2. At least one admin user (run `npm run seed:admin` first)
 *
 * Usage:
 *   npm run seed:course
 *   npm run seed:course -- --refresh   # re-upload assets and replace content
 */

import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { v2 as cloudinary } from 'cloudinary';

dotenv.config();

const args = process.argv.slice(2);
const shouldRefresh = args.includes('--refresh');

const SEED_TITLE = 'Introduction to Clinical Examination';

const DUMMY_COURSE_DIR = path.resolve(__dirname, '../../dummy course');
const THUMBNAIL_FILE = 'test.jpg';
const PDF_FILE =
  "Recommend flight search and booking API to integrate with AFARI's OurAirports-based architecture.pdf";

const THUMBNAIL_PATH = path.join(DUMMY_COURSE_DIR, THUMBNAIL_FILE);
const PDF_PATH = path.join(DUMMY_COURSE_DIR, PDF_FILE);

const CLOUDINARY_THUMBNAIL_FOLDER = 'native-med/thumbnails';
const CLOUDINARY_PDF_FOLDER = 'native-med/courses/pdfs';

if (!process.env.MONGO_URI) {
  console.error('❌  MONGO_URI is not set in your .env file');
  process.exit(1);
}

for (const key of ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'] as const) {
  if (!process.env[key]) {
    console.error(`❌  ${key} is not set in your .env file`);
    process.exit(1);
  }
}

if (!fs.existsSync(THUMBNAIL_PATH)) {
  console.error(`❌  Thumbnail not found: ${THUMBNAIL_PATH}`);
  process.exit(1);
}

if (!fs.existsSync(PDF_PATH)) {
  console.error(`❌  PDF not found: ${PDF_PATH}`);
  process.exit(1);
}

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
});

const destroyAsset = async (publicId: string, resourceType: 'image' | 'raw') => {
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
  } catch (err) {
    console.warn(`⚠️   Could not delete Cloudinary asset (${publicId}):`, err);
  }
};

const seed = async () => {
  console.log('🔌  Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGO_URI!);
  console.log('✅  Connected\n');

  const { Course } = await import('../modules/courses/model/courses.model');
  const { CourseContent } = await import('../modules/content/model/content.model');
  const { User } = await import('../modules/auth/model/auth.model');

  const admin = await User.findOne({ role: 'admin', isActive: true }).lean();
  if (!admin) {
    console.error('❌  No active admin found. Run `npm run seed:admin` first.');
    await mongoose.disconnect();
    process.exit(1);
  }
  console.log(`👤  Admin: ${admin.fullName} (${admin.email})\n`);

  const existing = await Course.findOne({ title: SEED_TITLE }).select('+thumbnailPublicId');
  if (existing && !shouldRefresh) {
    const contentCount = await CourseContent.countDocuments({ courseId: existing._id });
    console.log(`⚠️   Course already exists: "${SEED_TITLE}"`);
    console.log(`    ID: ${existing._id}`);
    console.log(`    Content items: ${contentCount}`);
    console.log('\n    Re-run with --refresh to replace assets and content.');
    await mongoose.disconnect();
    return;
  }

  if (existing && shouldRefresh) {
    console.log('🔄  Refreshing existing seed course...\n');

    if (existing.thumbnailPublicId) {
      await destroyAsset(existing.thumbnailPublicId, 'image');
    }

    const oldContent = await CourseContent.find({ courseId: existing._id }).select('+publicId');
    for (const item of oldContent) {
      if (item.type === 'pdf' && item.publicId) {
        await destroyAsset(item.publicId, 'raw');
      }
    }
    await CourseContent.deleteMany({ courseId: existing._id });
  }

  console.log('⬆️   Uploading thumbnail...');
  const thumbnailResult = await cloudinary.uploader.upload(THUMBNAIL_PATH, {
    folder: CLOUDINARY_THUMBNAIL_FOLDER,
    resource_type: 'image',
    use_filename: false,
    unique_filename: true,
    overwrite: false,
    transformation: [{ width: 800, height: 450, crop: 'fill', gravity: 'auto' }],
  });
  console.log(`    ✅  ${thumbnailResult.secure_url}\n`);

  console.log('⬆️   Uploading PDF...');
  const pdfResult = await cloudinary.uploader.upload(PDF_PATH, {
    folder: CLOUDINARY_PDF_FOLDER,
    resource_type: 'raw',
    type: 'authenticated',
    use_filename: false,
    unique_filename: true,
    overwrite: false,
  });
  console.log(`    ✅  ${pdfResult.secure_url}\n`);

  const courseData = {
    title: SEED_TITLE,
    description:
      'A sample course for development and testing. Covers core clinical examination ' +
      'techniques, structured history-taking, and communication skills for medical students ' +
      'preparing for OSCE assessments.',
    pricing: { monthly: 49.99, quarterly: 129.99 },
    thumbnailUrl: thumbnailResult.secure_url,
    thumbnailPublicId: thumbnailResult.public_id,
    isPublished: true,
    createdBy: admin._id,
  };

  const course = existing
    ? await Course.findByIdAndUpdate(existing._id, courseData, { new: true })
    : await Course.create(courseData);

  if (!course) {
    throw new Error('Failed to create or update course');
  }

  const pdfTitle = 'Module 1 — Clinical Examination Workbook';
  const content = await CourseContent.create({
    courseId: course._id,
    title: pdfTitle,
    type: 'pdf',
    fileUrl: pdfResult.secure_url,
    publicId: pdfResult.public_id,
    order: 1,
  });

  console.log('─────────────────────────────────────────');
  console.log('✅  Dummy course seeded successfully');
  console.log(`    Course ID  : ${course._id}`);
  console.log(`    Title      : ${course.title}`);
  console.log(`    Pricing    : £${course.pricing?.monthly ?? '—'}/mo, £${course.pricing?.quarterly ?? '—'}/qtr`);
  console.log(`    Published  : ${course.isPublished}`);
  console.log(`    Thumbnail  : ${course.thumbnailUrl}`);
  console.log(`    PDF content: ${content.title} (order ${content.order})`);
  console.log('─────────────────────────────────────────\n');

  await mongoose.disconnect();
  console.log('✔   Done');
};

seed().catch((err) => {
  console.error('\n❌  Seeder crashed:', err);
  mongoose.disconnect().finally(() => process.exit(1));
});
