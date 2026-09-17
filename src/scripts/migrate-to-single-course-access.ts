/**
 * One-time migration: collapse the two-tier course access model
 * (mocksessions_only / mocksession_and_lectures — two Drive folders, two
 * prices) into the new single-Drive-link, single-price model.
 *
 * For each course: promotes the mocksession_and_lectures tier's folder +
 * price to the new top-level driveFolderId/pricing fields. Courses whose
 * two Drive folders differ can't be auto-merged into one — those are
 * logged so an admin can consolidate the Drive content and set the link
 * manually afterwards.
 *
 * Also strips the now-unused tier fields from enrollments, subscriptions,
 * and payments.
 *
 * Uses the raw collection driver, not the Mongoose models, so it works
 * whether or not the schema files have already been updated.
 *
 * Usage: npx ts-node -r dotenv/config src/scripts/migrate-to-single-course-access.ts
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

if (!process.env.MONGO_URI) {
  console.error('❌  MONGO_URI is not set');
  process.exit(1);
}

interface LegacyTierPricing {
  monthly?: number;
  quarterly?: number;
}

interface LegacyCourse {
  _id: mongoose.Types.ObjectId;
  title: string;
  lecturesDriveFolderId?: string;
  mockSessionsDriveFolderId?: string;
  driveFolderId?: string;
  pricing?: {
    mocksessions_only?: LegacyTierPricing;
    mocksession_and_lectures?: LegacyTierPricing;
    monthly?: number;
    quarterly?: number;
  };
}

const main = async () => {
  console.log('🔌  Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGO_URI!);
  console.log('✅  Connected\n');

  const courses = mongoose.connection.collection<LegacyCourse>('courses');
  const enrollments = mongoose.connection.collection('enrollments');
  const subscriptions = mongoose.connection.collection('subscriptions');
  const payments = mongoose.connection.collection('payments');

  const allCourses = await courses.find({}).toArray();
  const mismatchedFolders: string[] = [];
  let migrated = 0;

  for (const course of allCourses) {
    if (course.driveFolderId) continue; // already migrated

    const driveFolderId = course.lecturesDriveFolderId ?? course.mockSessionsDriveFolderId;
    const pricing = course.pricing?.mocksession_and_lectures ?? {};

    if (
      course.lecturesDriveFolderId &&
      course.mockSessionsDriveFolderId &&
      course.lecturesDriveFolderId !== course.mockSessionsDriveFolderId
    ) {
      mismatchedFolders.push(`${course.title} (${course._id})`);
    }

    await courses.updateOne(
      { _id: course._id },
      {
        $set: { driveFolderId, pricing },
        $unset: { lecturesDriveFolderId: '', mockSessionsDriveFolderId: '' },
      },
    );
    migrated++;
  }

  console.log(`✅  Migrated ${migrated} course(s).`);
  if (mismatchedFolders.length) {
    console.log(
      '\n⚠️  These courses had two different Drive folders and could not be auto-merged ' +
      'into one link — consolidate the Drive content and set driveFolderId manually:',
    );
    mismatchedFolders.forEach((c) => console.log(`   - ${c}`));
  }

  const [enrollmentResult, subscriptionResult, paymentResult] = await Promise.all([
    enrollments.updateMany({}, { $unset: { accessTier: '' } }),
    subscriptions.updateMany({}, { $unset: { tier: '' } }),
    payments.updateMany({}, { $unset: { tier: '' } }),
  ]);

  console.log(`✅  Removed accessTier from ${enrollmentResult.modifiedCount} enrollment(s).`);
  console.log(`✅  Removed tier from ${subscriptionResult.modifiedCount} subscription(s).`);
  console.log(`✅  Removed tier from ${paymentResult.modifiedCount} payment(s).`);

  await mongoose.disconnect();
};

main().catch((err) => {
  console.error('\n❌  Migration failed:', err);
  mongoose.disconnect().finally(() => process.exit(1));
});
