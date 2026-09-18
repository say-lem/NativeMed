/**
 * seed-users.ts
 * -------------
 * Seeds three dummy student accounts with subscriptions:
 *   - All 3 → active course subscription + enrollment on the seed course
 *   - 2/3  → active case bank subscription
 *
 * Pre-requisites:
 *   1. MONGO_URI set in .env
 *   2. Seed course exists (run `npm run seed:course` first)
 *
 * Usage:
 *   npm run seed:users
 *   npm run seed:users -- --refresh   # reset subscriptions for seed users
 *
 * Login credentials (all use the same password):
 *   alice.student@example.com  / Password1   (course + case bank)
 *   bob.learner@example.com    / Password1   (course + case bank)
 *   carol.trainee@example.com  / Password1   (course only)
 */

import mongoose, { Types } from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const args = process.argv.slice(2);
const shouldRefresh = args.includes('--refresh');

const SEED_COURSE_TITLE = 'Introduction to Clinical Examination';
const SEED_PASSWORD = 'Password1';
const MANUAL_PAYMENT_ID = new Types.ObjectId('000000000000000000000000');

const SEED_USERS = [
  {
    fullName: 'Alice Student',
    email: 'alice.student@example.com',
    phone: '+447700900001',
    caseBank: true,
  },
  {
    fullName: 'Bob Learner',
    email: 'bob.learner@example.com',
    phone: '+447700900002',
    caseBank: true,
  },
  {
    fullName: 'Carol Trainee',
    email: 'carol.trainee@example.com',
    phone: '+447700900003',
    caseBank: false,
  },
];

if (!process.env.MONGO_URI) {
  console.error('❌  MONGO_URI is not set in your .env file');
  process.exit(1);
}

const periodEnd = () => {
  const end = new Date();
  end.setMonth(end.getMonth() + 1);
  return end;
};

const seed = async () => {
  console.log('🔌  Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGO_URI!);
  console.log('✅  Connected\n');

  const { User } = await import('../modules/auth/model/auth.model');
  const { Course } = await import('../modules/courses/model/courses.model');
  const { Subscription } = await import('../modules/subscriptions/model/subscriptions.model');
  const { Enrollment } = await import('../modules/enrollments/model/enrollments.model');

  const course = await Course.findOne({ title: SEED_COURSE_TITLE });
  if (!course) {
    console.error(`❌  Seed course not found: "${SEED_COURSE_TITLE}"`);
    console.error('    Run `npm run seed:course` first.');
    await mongoose.disconnect();
    process.exit(1);
  }
  console.log(`📚  Course: ${course.title} (${course._id})\n`);

  const now = new Date();
  const end = periodEnd();

  for (const seedUser of SEED_USERS) {
    const email = seedUser.email.toLowerCase();

    let user = await User.findOne({ email });
    if (!user) {
      user = await User.create({
        fullName: seedUser.fullName,
        email,
        passwordHash: SEED_PASSWORD,
        phone: seedUser.phone,
        role: 'user',
        isActive: true,
        mustChangePassword: false,
      });
      console.log(`👤  Created user: ${user.fullName} (${user.email})`);
    } else if (shouldRefresh) {
      user.fullName = seedUser.fullName;
      user.phone = seedUser.phone;
      user.isActive = true;
      await user.save();
      console.log(`👤  Refreshed user: ${user.fullName} (${user.email})`);
    } else {
      console.log(`👤  User exists: ${user.fullName} (${user.email})`);
    }

    const stripeCustomerId = `seed_cus_${user._id}`;
    const courseStripeSubId = `seed_sub_course_${user._id}`;

    const courseSub = await Subscription.findOneAndUpdate(
      { userId: user._id, type: 'course', courseId: course._id },
      {
        userId: user._id,
        type: 'course',
        courseId: course._id,
        billingInterval: 'monthly',
        status: 'active',
        stripeCustomerId,
        stripeSubscriptionId: courseStripeSubId,
        currentPeriodStart: now,
        currentPeriodEnd: end,
        cancelAtPeriodEnd: false,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    await Enrollment.findOneAndUpdate(
      { userId: user._id, courseId: course._id },
      {
        userId: user._id,
        courseId: course._id,
        paymentId: MANUAL_PAYMENT_ID,
        subscriptionId: courseSub._id,
        source: 'payment',
        isActive: true,
        accessGrantedAt: now,
      },
      { upsert: true, new: true },
    );

    console.log('    ✅  Course subscription + enrollment');

    if (seedUser.caseBank) {
      await Subscription.findOneAndUpdate(
        { userId: user._id, type: 'case_bank' },
        {
          userId: user._id,
          type: 'case_bank',
          billingInterval: 'monthly',
          status: 'active',
          stripeCustomerId,
          stripeSubscriptionId: `seed_sub_case_${user._id}`,
          currentPeriodStart: now,
          currentPeriodEnd: end,
          cancelAtPeriodEnd: false,
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
      console.log('    ✅  Case bank subscription');
    } else if (shouldRefresh) {
      await Subscription.deleteOne({ userId: user._id, type: 'case_bank' });
      console.log('    ⏭️   No case bank subscription');
    } else {
      console.log('    ⏭️   No case bank subscription');
    }

    console.log('');
  }

  const [userCount, courseSubCount, caseSubCount, enrollmentCount] = await Promise.all([
    User.countDocuments({ email: { $in: SEED_USERS.map((u) => u.email.toLowerCase()) } }),
    Subscription.countDocuments({ type: 'course', courseId: course._id, status: 'active' }),
    Subscription.countDocuments({ type: 'case_bank', status: 'active' }),
    Enrollment.countDocuments({ courseId: course._id, isActive: true }),
  ]);

  console.log('─────────────────────────────────────────');
  console.log('✅  Dummy users seeded');
  console.log(`    Users           : ${userCount}`);
  console.log(`    Course subs     : ${courseSubCount}`);
  console.log(`    Case bank subs  : ${caseSubCount}`);
  console.log(`    Enrollments     : ${enrollmentCount}`);
  console.log(`    Password (all)  : ${SEED_PASSWORD}`);
  console.log('─────────────────────────────────────────\n');

  await mongoose.disconnect();
  console.log('✔   Done');
};

seed().catch((err) => {
  console.error('\n❌  Seeder crashed:', err);
  mongoose.disconnect().finally(() => process.exit(1));
});
