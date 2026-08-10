/**
 * One-time data fix (2026-08-10): apply uniform standard pricing across
 * every course currently in the database, and remove any leftover legacy
 * priceMonthly/priceQuarterly fields (pre-dates the per-tier `pricing`
 * field introduced by migrate-course-pricing.ts).
 *
 * Standard pricing:
 *   mocksession_and_lectures (full course recordings) — £99.99/month, £289/quarter
 *   mocksessions_only (mock session recordings alone) — £69.99/month, £199/quarter
 *
 * This overwrites pricing on ALL courses, not just ones with an empty
 * mocksessions_only tier — every course is set to the same standard price.
 *
 * Usage: npx ts-node -r dotenv/config src/scripts/set-standard-course-pricing.ts
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

if (!process.env.MONGO_URI) {
  console.error('❌  MONGO_URI is not set');
  process.exit(1);
}

const STANDARD_PRICING = {
  mocksession_and_lectures: { monthly: 99.99, quarterly: 289 },
  mocksessions_only: { monthly: 69.99, quarterly: 199 },
};

interface LegacyCourse {
  _id: mongoose.Types.ObjectId;
  title: string;
  pricing?: typeof STANDARD_PRICING;
  priceMonthly?: number;
  priceQuarterly?: number;
}

const main = async () => {
  console.log('🔌  Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGO_URI!);
  console.log('✅  Connected\n');

  const col = mongoose.connection.collection<LegacyCourse>('courses');
  const courses = await col.find({}).toArray();

  let legacyFieldsRemoved = 0;

  for (const course of courses) {
    const hadLegacyFields = course.priceMonthly != null || course.priceQuarterly != null;
    if (hadLegacyFields) legacyFieldsRemoved++;

    console.log(`   ${course.title}`);
    console.log(`     before: ${JSON.stringify(course.pricing ?? {})}`);

    await col.updateOne(
      { _id: course._id },
      {
        $set: { pricing: STANDARD_PRICING },
        $unset: { priceMonthly: '', priceQuarterly: '' },
      },
    );

    console.log(`     after:  ${JSON.stringify(STANDARD_PRICING)}\n`);
  }

  console.log(`✅  Updated pricing for ${courses.length} course(s).`);
  console.log(`✅  Removed legacy priceMonthly/priceQuarterly from ${legacyFieldsRemoved} course(s).`);

  await mongoose.disconnect();
};

main().catch((err) => {
  console.error('\n❌  Failed:', err);
  mongoose.disconnect().finally(() => process.exit(1));
});
