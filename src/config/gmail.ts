import { google } from 'googleapis';
import { env } from './env';

// ─────────────────────────────────────────────────────────────────────────────
// Gmail client
// Authenticated via a 3-legged OAuth2 refresh token for the Gmail/Workspace
// account in EMAIL_FROM_ADDRESS — separate from the Drive integration's
// service account (google-drive.ts), which uses a different auth mechanism.
//
// Sent over HTTPS via the Gmail API, not SMTP — several hosts (Render's free
// tier included) block outbound SMTP ports entirely.
//
// Setup:
//   1. In Google Cloud Console, create an OAuth 2.0 Client ID (type: Web
//      application or Desktop app) — enable the Gmail API for that project.
//   2. Generate a refresh token authorized with the `gmail.send` scope, while
//      logged into the exact Gmail/Workspace account EMAIL_FROM_ADDRESS
//      belongs to (e.g. via https://developers.google.com/oauthplayground,
//      with your own Client ID/Secret set in its settings). Gmail rewrites
//      the From header to the authorized account's own address (or a
//      configured "Send As" alias) if it doesn't match.
//   3. Copy client_id, client_secret and the refresh_token into .env.
// ─────────────────────────────────────────────────────────────────────────────

const isGmailConfigured =
  !!env.GOOGLE_CLIENT_ID && !!env.GOOGLE_CLIENT_SECRET && !!env.GOOGLE_REFRESH_TOKEN;

if (!isGmailConfigured) {
  console.warn(
    '⚠️   Gmail API env vars not set — mail falls back to console logging.\n' +
    '    Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REFRESH_TOKEN to enable.',
  );
}

const oauth2Client = isGmailConfigured
  ? new google.auth.OAuth2(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET)
  : null;

oauth2Client?.setCredentials({ refresh_token: env.GOOGLE_REFRESH_TOKEN });

export const gmail = oauth2Client ? google.gmail({ version: 'v1', auth: oauth2Client }) : null;
