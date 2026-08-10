/**
 * One-time migration: move flat priceMonthly/priceQuarterly onto the
 * mocksession_and_lectures tier of the new per-tier `pricing` field.
 *
 * Run once after deploying the tier-based pricing change, before any course
 * is edited through the API (updateCourse merges against `pricing`, which
 * must exist first). Uses the raw collection driver, not the Mongoose model,
 * so it can read the old fields even after the schema has dropped them.
 *
 * Usage: npx ts-node -r dotenv/config src/scripts/migrate-course-pricing.ts
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

if (!process.env.MONGO_URI) {
  console.error('❌  MONGO_URI is not set');
  process.exit(1);
}

interface LegacyCourse {
  _id: mongoose.Types.ObjectId;
  title: string;
  priceMonthly?: number;
  priceQuarterly?: number;
  pricing?: unknown;
}

const main = async () => {
  console.log('🔌  Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGO_URI!);
  console.log('✅  Connected\n');

  const col = mongoose.connection.collection<LegacyCourse>('courses');
  const courses = await col.find({}).toArray();

  let migrated = 0;
  const needsMocksessionsOnlyPricing: string[] = [];

  for (const course of courses) {
    if (course.pricing) continue; // already migrated

    const pricing = {
      mocksession_and_lectures: {
        ...(course.priceMonthly != null && { monthly: course.priceMonthly }),
        ...(course.priceQuarterly != null && { quarterly: course.priceQuarterly }),
      },
      mocksessions_only: {},
    };

    await col.updateOne(
      { _id: course._id },
      { $set: { pricing }, $unset: { priceMonthly: '', priceQuarterly: '' } },
    );

    migrated++;
    needsMocksessionsOnlyPricing.push(`${course.title} (${course._id})`);
  }

  console.log(`✅  Migrated ${migrated} course(s).`);
  if (needsMocksessionsOnlyPricing.length) {
    console.log('\n⚠️  These courses need mocksessions_only pricing set via the update endpoint:');
    needsMocksessionsOnlyPricing.forEach((c) => console.log(`   - ${c}`));
  }

  await mongoose.disconnect();
};

main().catch((err) => {
  console.error('\n❌  Migration failed:', err);
  mongoose.disconnect().finally(() => process.exit(1));
});
