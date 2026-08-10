import { google } from 'googleapis';
import { Readable } from 'stream';
import { env } from './env';

/** Normalize service account key from .env (handles literal \\n and missing PEM headers). */
export const normalizeGooglePrivateKey = (raw: string): string => {
  const key = raw.replace(/\\n/g, '\n').trim();
  if (key.includes('BEGIN PRIVATE KEY')) return key;

  const body = key.replace(/\s+/g, '');
  return `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----\n`;
};

// ─────────────────────────────────────────────────────────────────────────────
// Drive client
// Authenticated via a Google Service Account.
// The service account must have Editor access to every course Drive folder
// and to the shared subscribers folder.
//
// Setup:
//   1. Create a Service Account in Google Cloud Console
//   2. Enable the Google Drive API
//   3. Download the JSON key — copy client_email and private_key into .env
//   4. Share each Drive folder with the service account email (Editor role)
//
// Shared Drives: if a course's folders live inside a Shared Drive (Team
// Drive) rather than a regular "My Drive" folder, there's no "Editor" role —
// use Manager instead (Content Manager can share folders too, but only if a
// Manager has enabled "allow Content Managers to share outside the drive";
// Manager works unconditionally). Every call below passes
// supportsAllDrives: true, which the Drive API requires to even locate a
// Shared Drive item — omitting it fails with "File not found" regardless of
// the service account's role.
// ─────────────────────────────────────────────────────────────────────────────

const isDriveConfigured =
  !!env.GOOGLE_SERVICE_ACCOUNT_EMAIL && !!env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

if (!isDriveConfigured) {
  console.warn(
    '⚠️   Google Drive env vars not set — Drive integration is disabled.\n' +
    '    Set GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY to enable.',
  );
}

const auth = isDriveConfigured
  ? new google.auth.GoogleAuth({
      credentials: {
        client_email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: normalizeGooglePrivateKey(env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY!),
      },
      scopes: ['https://www.googleapis.com/auth/drive'],
    })
  : null;

const drive = auth ? google.drive({ version: 'v3', auth }) : null;

// ─────────────────────────────────────────────────────────────────────────────
// Guard — wraps every Drive call so the app doesn't crash when Drive isn't
// configured (dev environments without credentials, for example).
// ─────────────────────────────────────────────────────────────────────────────

const withDrive = async <T>(
  label: string,
  fn: (d: ReturnType<typeof google.drive>) => Promise<T>,
): Promise<T | null> => {
  if (!drive) {
    console.warn(`⚠️   Drive not configured — skipping: ${label}`);
    return null;
  }
  try {
    return await fn(drive);
  } catch (err) {
    // Log but never throw — Drive errors must never break the core enrollment flow
    console.error(`❌  Drive error [${label}]:`, err instanceof Error ? err.message : err);
    return null;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Permission management
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Grant a user Viewer access to a Drive folder.
 * Used when a course enrollment or subscription is created.
 */
export const addDrivePermission = async (
  email: string,
  folderId: string,
  notificationMessage?: string,
): Promise<void> => {
  await withDrive(`addPermission(${email}, ${folderId})`, async (d) => {
    await d.permissions.create({
      fileId: folderId,
      sendNotificationEmail: true,
      emailMessage:
        notificationMessage ??
        'You now have access to your Native Med course materials on Google Drive.',
      requestBody: {
        type: 'user',
        role: 'reader',
        emailAddress: email,
      },
      // Required for folderId to resolve when it lives inside a Shared Drive —
      // without this the API returns "File not found" even with correct access.
      supportsAllDrives: true,
    });
  });
};

/**
 * Revoke a user's access to a Drive folder.
 * Used when a course enrollment is revoked or a subscription expires.
 */
export const removeDrivePermission = async (
  email: string,
  folderId: string,
): Promise<void> => {
  await withDrive(`removePermission(${email}, ${folderId})`, async (d) => {
    // List permissions to find the permission ID for this email address
    const res = await d.permissions.list({
      fileId: folderId,
      fields: 'permissions(id,emailAddress)',
      supportsAllDrives: true,
    });

    const perm = res.data.permissions?.find(
      (p) => p.emailAddress?.toLowerCase() === email.toLowerCase(),
    );

    if (!perm?.id) {
      // Permission not found — already removed or user never had access
      console.warn(`⚠️   Drive: no permission found for ${email} on folder ${folderId}`);
      return;
    }

    await d.permissions.delete({
      fileId: folderId,
      permissionId: perm.id,
      supportsAllDrives: true,
    });
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// File management
// ─────────────────────────────────────────────────────────────────────────────

export interface DriveUploadResult {
  fileId: string;
  fileUrl: string;  // webViewLink — shareable viewer URL
}

/**
 * Upload a file buffer to a specific Drive folder.
 * Returns the file ID (for future deletions) and a viewer URL.
 */
export const uploadFileToDrive = async (
  buffer: Buffer,
  filename: string,
  folderId: string,
): Promise<DriveUploadResult | null> => {
  return withDrive(`uploadFile(${filename})`, async (d) => {
    const res = await d.files.create({
      requestBody: {
        name: filename,
        parents: [folderId],
        mimeType: 'application/pdf',
      },
      media: {
        mimeType: 'application/pdf',
        body: Readable.from(buffer),
      },
      fields: 'id,webViewLink',
      supportsAllDrives: true,
    });

    const fileId = res.data.id;
    const fileUrl = res.data.webViewLink;

    if (!fileId || !fileUrl) {
      throw new Error('Drive upload returned an incomplete response');
    }

    return { fileId, fileUrl };
  });
};

/**
 * Permanently delete a file from Drive.
 * Called when an admin removes a content item.
 */
export const deleteFileFromDrive = async (fileId: string): Promise<void> => {
  await withDrive(`deleteFile(${fileId})`, async (d) => {
    await d.files.delete({ fileId, supportsAllDrives: true });
  });
};