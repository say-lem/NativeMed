import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(5000),

  MONGO_URI: z.string().min(1, 'MONGO_URI is required'),

  ACCESS_TOKEN_SECRET: z.string().min(32, 'ACCESS_TOKEN_SECRET must be at least 32 chars'),
  REFRESH_TOKEN_SECRET: z.string().min(32, 'REFRESH_TOKEN_SECRET must be at least 32 chars'),
  ACCESS_TOKEN_EXPIRES_IN: z.string().default('15m'),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default('7d'),

  CLOUDINARY_CLOUD_NAME: z.string().min(1, 'CLOUDINARY_CLOUD_NAME is required'),
  CLOUDINARY_API_KEY: z.string().min(1, 'CLOUDINARY_API_KEY is required'),
  CLOUDINARY_API_SECRET: z.string().min(1, 'CLOUDINARY_API_SECRET is required'),

  CLIENT_URL: z.string().url().default('http://localhost:3000'),

  // ── Email (Gmail API) ─────────────────────────────────────────────────────────
  // Sent over HTTPS via the Gmail API, not SMTP — Render (and several other
  // hosts) block outbound SMTP ports (25/465/587) on free tiers. OAuth2 client
  // credentials + a refresh token for the Gmail account in EMAIL_FROM_ADDRESS,
  // authorized with the gmail.send scope. If unset, the mailer falls back to
  // console logging (useful for local dev).
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REFRESH_TOKEN: z.string().optional(),
  EMAIL_FROM_NAME: z.string().default('Native Med'),
  EMAIL_FROM_ADDRESS: z.string().email().default('noreply@nativemed.com'),

  // ── Contact form ──────────────────────────────────────────────────────────────
  // Inbox that receives public contact-form submissions. Falls back to
  // EMAIL_FROM_ADDRESS if unset.
  CONTACT_EMAIL_TO: z.string().email().optional(),

  // ── Password reset ───────────────────────────────────────────────────────────
  RESET_TOKEN_EXPIRES_MINUTES: z.coerce.number().default(15),

  // ── Google Drive (optional) — service account JSON key fields as env vars ───
  // Enable Drive API in GCP; share target folders with the service account email.
  GOOGLE_SERVICE_ACCOUNT_EMAIL: z.string().optional(),
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: z.string().optional(),

  // ── Stripe (required for payments) ─────────────────────────────────────────
  STRIPE_SECRET_KEY: z.string().min(1, 'STRIPE_SECRET_KEY is required'),
  STRIPE_WEBHOOK_SECRET: z.string().min(1, 'STRIPE_WEBHOOK_SECRET is required'),

  // Stripe Price IDs — create products/prices in the Stripe Dashboard first
  STRIPE_PRICE_CASE_BANK_MONTHLY: z.string().min(1, 'STRIPE_PRICE_CASE_BANK_MONTHLY is required'),
  // Legacy — course checkout uses the course's per-tier `pricing` (dynamic Stripe price_data).
  STRIPE_PRICE_COURSE_PDF_MONTHLY: z.string().optional(),
  STRIPE_PRICE_COURSE_PDF_QUARTERLY: z.string().optional(),
  STRIPE_PRICE_COURSE_FULL_MONTHLY: z.string().optional(),
  STRIPE_PRICE_COURSE_FULL_QUARTERLY: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌  Invalid environment variables:\n');
  parsed.error.issues.forEach((issue) => {
    console.error(`  ${issue.path.join('.')} — ${issue.message}`);
  });
  process.exit(1);
}

export const env = parsed.data;