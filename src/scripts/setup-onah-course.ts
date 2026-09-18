/**
 * One-time setup: Onah Chinedum course, PDF content, user + lecture subscription.
 *
 * Usage: npx ts-node -r dotenv/config src/scripts/setup-onah-course.ts
 */

import mongoose, { Types } from 'mongoose';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { v2 as cloudinary } from 'cloudinary';

dotenv.config();

const COURSE_TITLE = 'Onah Chinedum';
const LECTURES_DRIVE_FOLDER =
  'https://drive.google.com/drive/folders/10aYg5EFRmbyrhJpGbPcUhny9ST9kAL-T?usp=sharing';
const PDF_PATH = path.resolve(__dirname, '../../Onah Chinedum Salem.pdf');
const USER = {
  fullName: 'Onah Chinedum Salem',
  email: 'salemonah4@gmail.com',
  phone: '+447700900004',
  password: 'Password1',
};
const MANUAL_PAYMENT_ID = new Types.ObjectId('000000000000000000000000');

const LECTURES_FOLDER_ID = '10aYg5EFRmbyrhJpGbPcUhny9ST9kAL-T';

if (!process.env.MONGO_URI) {
  console.error('❌  MONGO_URI is not set');
  process.exit(1);
}

for (const key of ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'] as const) {
  if (!process.env[key]) {
    console.error(`❌  ${key} is not set`);
    process.exit(1);
  }
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

const main = async () => {
  console.log('🔌  Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGO_URI!);
  console.log('✅  Connected\n');

  const { Course } = await import('../modules/courses/model/courses.model');
  const { CourseContent } = await import('../modules/content/model/content.model');
  const { User } = await import('../modules/auth/model/auth.model');
  const { Subscription } = await import('../modules/subscriptions/model/subscriptions.model');
  const { createEnrollmentFromSubscription } = await import(
    '../modules/enrollments/service/enrollments.service'
  );

  const admin = await User.findOne({ role: 'admin', isActive: true }).lean();
  if (!admin) {
    console.error('❌  No active admin found. Run `npm run seed:admin` first.');
    process.exit(1);
  }

  let course = await Course.findOne({ title: COURSE_TITLE }).select('+driveFolderId');
  if (!course) {
    course = await Course.create({
      title: COURSE_TITLE,
      description:
        'Course materials for Onah Chinedum — includes lecture recordings on Google Drive and supporting PDF resources.',
      pricing: { monthly: 49.99, quarterly: 129.99 },
      driveFolderId: LECTURES_FOLDER_ID,
      isPublished: true,
      createdBy: admin._id,
    });
    console.log(`📚  Created course: ${course.title} (${course._id})`);
  } else {
    course.driveFolderId = LECTURES_FOLDER_ID;
    course.isPublished = true;
    await course.save();
    console.log(`📚  Updated existing course: ${course.title} (${course._id})`);
  }

  const existingPdf = await CourseContent.findOne({ courseId: course._id, type: 'pdf' });
  if (!existingPdf) {
    console.log('⬆️   Uploading PDF to Cloudinary...');
    const pdfResult = await cloudinary.uploader.upload(PDF_PATH, {
      folder: 'native-med/courses/pdfs',
      resource_type: 'raw',
      type: 'authenticated',
      use_filename: true,
      unique_filename: true,
    });

    await CourseContent.create({
      courseId: course._id,
      title: 'Onah Chinedum Salem — Course PDF',
      type: 'pdf',
      fileUrl: pdfResult.secure_url,
      publicId: pdfResult.public_id,
      order: 1,
    });
    console.log(`    ✅  PDF uploaded: ${pdfResult.secure_url}`);
  } else {
    console.log(`📄  PDF content already exists: ${existingPdf.title}`);
  }

  const email = USER.email.toLowerCase();
  let user = await User.findOne({ email });
  if (!user) {
    user = await User.create({
      fullName: USER.fullName,
      email,
      passwordHash: USER.password,
      phone: USER.phone,
      role: 'user',
      isActive: true,
      mustChangePassword: false,
    });
    console.log(`👤  Created user: ${user.fullName} (${user.email})`);
  } else {
    console.log(`👤  User already exists: ${user.fullName} (${user.email})`);
  }

  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  const subscription = await Subscription.findOneAndUpdate(
    { userId: user._id, type: 'course', courseId: course._id },
    {
      userId: user._id,
      type: 'course',
      courseId: course._id,
      billingInterval: 'monthly',
      status: 'active',
      stripeCustomerId: `manual_cus_${user._id}`,
      stripeSubscriptionId: `manual_sub_course_${user._id}`,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  await createEnrollmentFromSubscription(
    user._id,
    course._id.toString(),
    subscription._id,
  );

  console.log('\n─────────────────────────────────────────');
  console.log('✅  Setup complete');
  console.log(`    Course ID     : ${course._id}`);
  console.log(`    Course title  : ${course.title}`);
  console.log(`    Lectures Drive: ${LECTURES_DRIVE_FOLDER}`);
  console.log(`    User email    : ${user.email}`);
  console.log(`    Password      : ${USER.password}`);
  console.log('─────────────────────────────────────────\n');

  await mongoose.disconnect();
};

main().catch((err) => {
  console.error('\n❌  Setup failed:', err);
  mongoose.disconnect().finally(() => process.exit(1));
});
