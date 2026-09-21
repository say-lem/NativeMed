/**
 * test-email-connection.ts
 * ---------------------------------
 * Validates Gmail API credentials by sending a real test email through the
 * app's own sendMail() wrapper.
 *
 * Usage: npm run test:email -- recipient@example.com
 */

import { env } from '../config/env';
import { sendMail } from '../shared/services/email.service';

const main = async () => {
  const to = process.argv[2];

  if (!to) {
    console.error('Usage: npm run test:email -- recipient@example.com');
    process.exit(1);
  }

  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REFRESH_TOKEN) {
    console.error(
      '✗ GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN are not all set — ' +
        'mail would fall back to console logging, not a real send.',
    );
    process.exit(1);
  }

  console.log('\n=== Email Connection Test ===\n');
  console.log(`  From: "${env.EMAIL_FROM_NAME}" <${env.EMAIL_FROM_ADDRESS}>`);
  console.log(`  To:   ${to}\n`);

  try {
    await sendMail({
      to,
      subject: 'Native Med — Gmail API test email',
      html: '<p>This is a test email confirming the Gmail API is configured correctly.</p>',
      text: 'This is a test email confirming the Gmail API is configured correctly.',
    });
    console.log('  ✓ sendMail() resolved without error — check the inbox (and spam folder).\n');
    console.log('Result: PASS\n');
    process.exit(0);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`  ✗ sendMail() failed: ${message}\n`);
    console.log('Result: FAIL\n');
    process.exit(1);
  }
};

main();
