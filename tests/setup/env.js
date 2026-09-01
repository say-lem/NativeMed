// Fake env — loaded before any src module (which validates env at import time
// via zod in src/config/env.ts). Values only need to satisfy that schema;
// nothing here ever talks to a real external service in tests.
process.env.NODE_ENV = 'test';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/test-placeholder';

process.env.ACCESS_TOKEN_SECRET = 'test-access-token-secret-please-ignore-me';
process.env.REFRESH_TOKEN_SECRET = 'test-refresh-token-secret-please-ignore';
process.env.ACCESS_TOKEN_EXPIRES_IN = '15m';
process.env.REFRESH_TOKEN_EXPIRES_IN = '7d';

process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
process.env.CLOUDINARY_API_KEY = 'test-key';
process.env.CLOUDINARY_API_SECRET = 'test-secret';

process.env.CLIENT_URL = 'http://localhost:3000';

process.env.EMAIL_FROM_NAME = 'Native Med Test';
process.env.EMAIL_FROM_ADDRESS = 'noreply@nativemed.test';

process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_fake';
process.env.STRIPE_PRICE_CASE_BANK_MONTHLY = 'price_fake_case_bank_monthly';

// Explicitly blank — .env has real Google service-account credentials, and
// dotenv.config() (called from src/config/env.ts) never overrides a key
// that's already set. Leaving these unset here would let the real
// credentials through and google-drive.ts would start making live API
// calls during enrollment/course tests. Blank keeps isDriveConfigured
// false, so every Drive call in src/config/google-drive.ts becomes a
// harmless no-op (see the withDrive() guard there).
process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = '';
process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = '';

// No real SMTP_HOST is set in .env either, so nodemailer already falls back
// to its offline jsonTransport — but pin it explicitly so that stays true
// even if someone adds SMTP_HOST to .env later.
process.env.SMTP_HOST = '';

