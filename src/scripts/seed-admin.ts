/**
 * seed-admin.ts
 * -------------
 * Creates the first superadmin account when the database has no admins.
 * Run once during initial deployment — safe to re-run (skips if an admin
 * already exists).
 *
 * Usage:
 *   npm run seed:admin
 *
 * Required env vars (set in your .env file):
 *   SEED_ADMIN_NAME      Full name of the first admin
 *   SEED_ADMIN_EMAIL     Email address (used to log in)
 *   SEED_ADMIN_PHONE     Phone number
 *   SEED_ADMIN_PASSWORD  Password — min 8 chars, must include uppercase + number
 */

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

// ─────────────────────────────────────────────────────────────────────────────
// Validate required seed vars before connecting
// ─────────────────────────────────────────────────────────────────────────────

const SEED_ADMIN_NAME     = process.env.SEED_ADMIN_NAME;
const SEED_ADMIN_EMAIL    = process.env.SEED_ADMIN_EMAIL;
const SEED_ADMIN_PHONE    = process.env.SEED_ADMIN_PHONE;
const SEED_ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD;
const MONGO_URI           = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error('❌  MONGO_URI is not set in your .env file');
  process.exit(1);
}

if (!SEED_ADMIN_NAME || !SEED_ADMIN_EMAIL || !SEED_ADMIN_PHONE || !SEED_ADMIN_PASSWORD) {
  console.error('❌  Missing required seed variables. Set all four in your .env:');
  console.error('    SEED_ADMIN_NAME');
  console.error('    SEED_ADMIN_EMAIL');
  console.error('    SEED_ADMIN_PHONE');
  console.error('    SEED_ADMIN_PASSWORD');
  process.exit(1);
}

if (SEED_ADMIN_PASSWORD.length < 8) {
  console.error('❌  SEED_ADMIN_PASSWORD must be at least 8 characters');
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Seed
// ─────────────────────────────────────────────────────────────────────────────

const seed = async () => {
  console.log(' Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI);
  console.log('✅  Connected\n');

  // Dynamic import after connection so Mongoose registers models correctly
  const { User } = await import('../modules/auth/model/auth.model');

  // ── Guard: skip if an admin already exists ─────────────────────────────────
  const existingAdmin = await User.findOne({ role: 'admin' });
  if (existingAdmin) {
    console.log(`⚠️   An admin already exists: ${existingAdmin.email}`);
    console.log('    Skipping seed — no changes made.');
    console.log('\n    To add more admins use: POST /api/v1/auth/admin/create');
    await mongoose.disconnect();
    return;
  }

  // ── Hash password manually — pre-save hook won't fire on Model.create ──────
  // (Actually the pre-save hook DOES fire on create, but we hash here anyway
  //  so the script is self-contained and doesn't rely on hook ordering.)
  const salt         = await bcrypt.genSalt(12);
  const passwordHash = await bcrypt.hash(SEED_ADMIN_PASSWORD, salt);

  const admin = await User.create({
    fullName:          SEED_ADMIN_NAME.trim(),
    email:             SEED_ADMIN_EMAIL.toLowerCase().trim(),
    passwordHash,
    phone:             SEED_ADMIN_PHONE.trim(),
    role:              'admin',
    isActive:          true,
    mustChangePassword: false,
  });

  console.log('✅  Superadmin created successfully:');
  console.log(`    Name  : ${admin.fullName}`);
  console.log(`    Email : ${admin.email}`);
  console.log(`    ID    : ${admin._id}`);
  console.log('\n🔑  Log in at: POST /api/v1/auth/login');
  console.log('    Then use POST /api/v1/auth/admin/create to add more admins.\n');

  await mongoose.disconnect();
};

seed().catch((err) => {
  console.error('❌  Seed failed:', err);
  mongoose.disconnect().finally(() => process.exit(1));
});