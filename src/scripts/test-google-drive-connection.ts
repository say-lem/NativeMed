/**
 * test-google-drive-connection.ts
 * ---------------------------------
 * Validates Google Drive service account credentials and API access.
 *
 * Usage: npm run test:drive
 */

import { google } from 'googleapis';
import { env } from '../config/env';
import { normalizeGooglePrivateKey } from '../config/google-drive';

const main = async () => {
  const results: string[] = [];
  const errors: string[] = [];

  const email = env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() ?? '';
  const rawKey = env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.trim() ?? '';

  if (!email) {
    errors.push('GOOGLE_SERVICE_ACCOUNT_EMAIL is not set');
  } else if (!email.includes('@') || !email.endsWith('.iam.gserviceaccount.com')) {
    errors.push('GOOGLE_SERVICE_ACCOUNT_EMAIL does not look like a service account email');
  } else {
    results.push(`Service account email: OK (${email})`);
  }

  if (!rawKey) {
    errors.push('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY is not set');
  } else {
    const privateKey = normalizeGooglePrivateKey(rawKey);
    if (!privateKey.includes('BEGIN PRIVATE KEY')) {
      errors.push('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY missing BEGIN PRIVATE KEY block');
    } else if (!privateKey.includes('END PRIVATE KEY')) {
      errors.push('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY missing END PRIVATE KEY block');
    } else {
      results.push('Private key: format OK');
    }
  }

  if (errors.length > 0) {
    printReport(results, errors);
    process.exit(1);
  }

  const privateKey = normalizeGooglePrivateKey(rawKey);

  try {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: email,
        private_key: privateKey,
      },
      scopes: ['https://www.googleapis.com/auth/drive'],
    });

    const drive = google.drive({ version: 'v3', auth });

    const about = await drive.about.get({
      fields: 'user(displayName,emailAddress,permissionId),storageQuota(limit,usage)',
    });

    const user = about.data.user;
    if (user?.emailAddress) {
      results.push(`Drive API auth: OK (authenticated as ${user.emailAddress})`);
    } else {
      results.push('Drive API auth: OK');
    }

    const list = await drive.files.list({
      pageSize: 5,
      fields: 'files(id,name,mimeType,shared)',
      q: "trashed = false",
      orderBy: 'modifiedTime desc',
    });

    const files = list.data.files ?? [];
    results.push(`Drive files.list: OK (${files.length} recent file(s) visible)`);

    for (const file of files.slice(0, 3)) {
      results.push(`  • ${file.name ?? file.id} (${file.mimeType ?? 'unknown type'})`);
    }

    if (files.length === 0) {
      results.push(
        '  Note: no files returned — share course folders with the service account email (Editor role)',
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(`Drive API call failed: ${message}`);

    if (message.includes('invalid_grant') || message.includes('DECODER routines')) {
      errors.push(
        'Private key may be malformed — paste the full key from the JSON file and use \\n for line breaks in .env',
      );
    }
    if (message.includes('Google Drive API has not been used') || message.includes('accessNotConfigured')) {
      errors.push('Enable the Google Drive API in your Google Cloud project');
    }
  }

  printReport(results, errors);
  process.exit(errors.length > 0 ? 1 : 0);
};

const printReport = (results: string[], errors: string[]) => {
  console.log('\n=== Google Drive Connection Test ===\n');
  for (const line of results) console.log(`  ✓ ${line}`);
  for (const line of errors) console.log(`  ✗ ${line}`);
  console.log(`\nResult: ${errors.length === 0 ? 'PASS' : 'FAIL'} (${errors.length} issue(s))\n`);
};

main().catch((error) => {
  console.error('Google Drive test crashed:', error);
  process.exit(1);
});
