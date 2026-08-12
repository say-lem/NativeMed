/**
 * One-time migration: add telegramChannel/whatsappChannel fields to existing
 * course documents, defaulted to null (mirrors the Mongoose schema default so
 * existing docs read consistently with newly-created ones).
 *
 * Uses the raw collection driver, not the Mongoose model, so it only touches
 * docs that don't already have these fields.
 *
 * Usage: npx ts-node -r dotenv/config src/scripts/backfill-course-channels.ts
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

  const col = mongoose.connection.collection('courses');

  const result = await col.updateMany(
    {
      $or: [
        { telegramChannel: { $exists: false } },
        { whatsappChannel: { $exists: false } },
      ],
    },
    { $set: { telegramChannel: null, whatsappChannel: null } },
  );

  console.log(`✅  Backfilled ${result.modifiedCount} course(s).`);

  await mongoose.disconnect();
};

main().catch((err) => {
  console.error('\n❌  Migration failed:', err);
  mongoose.disconnect().finally(() => process.exit(1));
});
