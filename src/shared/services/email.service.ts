import nodemailer, { Transporter } from 'nodemailer';
import { env } from '../../config/env';

// ── Transport ─────────────────────────────────────────────────────────────────
// In development without SMTP credentials, nodemailer falls back to a
// console transport so the app runs without email infrastructure.

let transporter: Transporter;

if (env.NODE_ENV === 'production' || env.SMTP_HOST) {
  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE, // true for 465, false for other ports
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
  });
} else {
  // Development console transport — prints email content to stdout
  transporter = nodemailer.createTransport({
    jsonTransport: true,
  });
}

// ── Send helper 

export interface MailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  // When true, body content is suppressed from dev logs (reset links, temp passwords, etc.)
  containsSensitiveData?: boolean;
}

/**
 * Redact patterns that should never appear in logs:
 *  - URL query params that look like tokens  (?token=…)
 *  - Standalone hex strings ≥ 32 chars (raw tokens)
 *  - Anything that looks like a password line ("password: XYZ")
 */
const redactSensitiveContent = (text: string): string =>
  text
    .replace(/[?&]token=[^\s&"<]+/gi, '?token=[REDACTED]')
    .replace(/\b[a-f0-9]{32,}\b/gi, '[REDACTED_TOKEN]')
    .replace(/(password[:\s]+)\S+/gi, '$1[REDACTED]')
    .replace(/(temporary password[:\s]+)\S+/gi, '$1[REDACTED]');

export const sendMail = async (options: MailOptions): Promise<void> => {
  const mailOptions = {
    from: `"${env.EMAIL_FROM_NAME}" <${env.EMAIL_FROM_ADDRESS}>`,
    to: options.to,
    subject: options.subject,
    html: options.html,
    text: options.text,
  };

  const info = await transporter.sendMail(mailOptions);

  if (env.NODE_ENV !== 'production' && !env.SMTP_HOST) {
    console.log('\n📧  ── DEV EMAIL ──────────────────────────────────');
    console.log(`  To:      ${options.to}`);
    console.log(`  Subject: ${options.subject}`);

    if (options.containsSensitiveData) {
      // Never log reset links, temp passwords, or auth tokens — even in dev.
      // Check your SMTP inbox or use a local mail catcher (e.g. Mailpit).
      console.log('  Body:    [SUPPRESSED — contains sensitive data]');
      console.log('  Tip:     Run Mailpit (https://mailpit.axllent.org) to');
      console.log('           inspect emails locally without leaking secrets.');
    } else {
      const stripped = options.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      const safe = redactSensitiveContent(stripped);
      console.log(`  Body:    ${safe.slice(0, 300)}${safe.length > 300 ? '…' : ''}`);
    }

    console.log('──────────────────────────────────────────────────\n');
  } else {
    console.log(`✉️   Email sent to ${options.to} — Message ID: ${info.messageId}`);
  }
};