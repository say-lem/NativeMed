import { env } from '../../../config/env';
import { sendMail } from '../../../shared/services/email.service';
import { ContactMessageInput } from '../schema/contact.schema';

// ── Shared layout wrapper ─────────────────────────────────────────────────────

const layout = (title: string, body: string): string => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    body { margin: 0; padding: 0; background: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #18181b; }
    .wrapper { max-width: 560px; margin: 40px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
    .header { background: #0f172a; padding: 32px 40px; text-align: center; }
    .header h1 { margin: 0; color: #ffffff; font-size: 22px; font-weight: 600; letter-spacing: -0.3px; }
    .header p { margin: 4px 0 0; color: #94a3b8; font-size: 13px; }
    .body { padding: 40px; }
    .body p { margin: 0 0 16px; font-size: 15px; line-height: 1.6; color: #3f3f46; }
    .body p:last-child { margin-bottom: 0; }
    .note { font-size: 13px !important; color: #71717a !important; }
    .divider { border: none; border-top: 1px solid #e4e4e7; margin: 24px 0; }
    .footer { background: #fafafa; padding: 20px 40px; text-align: center; font-size: 12px; color: #a1a1aa; border-top: 1px solid #e4e4e7; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>Native Med</h1>
      <p>Contact Form Submission</p>
    </div>
    <div class="body">${body}</div>
    <div class="footer">
      &copy; ${new Date().getFullYear()} Native Med. All rights reserved.
    </div>
  </div>
</body>
</html>
`;

// HTML-escape user-supplied fields before interpolating into the email body
const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

// ── Contact form notification ─────────────────────────────────────────────────
// Fires the moment a message is submitted — nothing is persisted to the DB.

export const sendContactMessageEmail = async ({
  fullName,
  email,
  message,
}: ContactMessageInput): Promise<void> => {
  const safeName = escapeHtml(fullName);
  const safeEmail = escapeHtml(email);
  const safeMessage = escapeHtml(message).replace(/\n/g, '<br/>');

  const body = `
    <p>You've received a new message from the Native Med contact form.</p>
    <p><strong>Name:</strong> ${safeName}<br/>
    <strong>Email:</strong> ${safeEmail}</p>
    <hr class="divider" />
    <p>${safeMessage}</p>
    <hr class="divider" />
    <p class="note">Reply directly to this email to respond to ${safeName}.</p>
  `;

  await sendMail({
    to: env.CONTACT_EMAIL_TO ?? env.EMAIL_FROM_ADDRESS,
    replyTo: email,
    subject: `New contact form message from ${fullName}`,
    html: layout('New Contact Message', body),
    text: `New contact form message\nName: ${fullName}\nEmail: ${email}\n\n${message}`,
  });
};
