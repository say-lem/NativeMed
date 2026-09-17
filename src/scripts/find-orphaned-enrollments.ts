/**
 * Dry-run: find enrollment records whose courseId no longer exists in the
 * courses collection (i.e. the course was deleted before the cascade-delete
 * fix). Reports what would be deleted — does not delete anything.
 *
 * Usage: npx ts-node -r dotenv/config src/scripts/find-orphaned-enrollments.ts
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

  const enrollments = mongoose.connection.collection('enrollments');
  const courses = mongoose.connection.collection('courses');

  const allEnrollments = await enrollments.find({}).toArray();
  const courseIds = new Set(
    (await courses.find({}, { projection: { _id: 1 } }).toArray()).map((c) => c._id.toString()),
  );

  const orphaned = allEnrollments.filter((e) => !courseIds.has(e.courseId?.toString()));

  console.log(`Total enrollments: ${allEnrollments.length}`);
  console.log(`Orphaned (courseId not found in courses): ${orphaned.length}\n`);

  if (orphaned.length) {
    console.log('Orphaned enrollment records:');
    orphaned.forEach((e) => {
      console.log(
        `  - _id=${e._id} userId=${e.userId} courseId=${e.courseId} isActive=${e.isActive} source=${e.source}`,
      );
    });
  }

  await mongoose.disconnect();
};

main().catch((err) => {
  console.error('❌  Failed:', err);
  mongoose.disconnect().finally(() => process.exit(1));
});
