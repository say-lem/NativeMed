import { sendMail } from '../../../shared/services/email.service';

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
    .btn { display: inline-block; margin: 8px 8px 8px 0; padding: 14px 32px; background: #2563eb; color: #ffffff !important; text-decoration: none; border-radius: 8px; font-size: 15px; font-weight: 600; }
    .btn.telegram { background: #229ed9; }
    .btn.whatsapp { background: #25d366; }
    .note { font-size: 13px !important; color: #71717a !important; }
    .divider { border: none; border-top: 1px solid #e4e4e7; margin: 24px 0; }
    .footer { background: #fafafa; padding: 20px 40px; text-align: center; font-size: 12px; color: #a1a1aa; border-top: 1px solid #e4e4e7; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>Native Med</h1>
      <p>Medical Education Platform</p>
    </div>
    <div class="body">${body}</div>
    <div class="footer">
      &copy; ${new Date().getFullYear()} Native Med. All rights reserved.<br/>
      If you did not request this email, you can safely ignore it.
    </div>
  </div>
</body>
</html>
`;

// ── Enrollment confirmation email (sent after a user enrolls in a course) ─────

export const sendEnrollmentEmail = async (
  to: string,
  fullName: string,
  courseTitle: string,
  telegramChannel?: string | null,
  whatsappChannel?: string | null,
): Promise<void> => {
  const channelLinks: string[] = [];
  const channelButtons: string[] = [];

  if (telegramChannel) {
    channelLinks.push(`Telegram: ${telegramChannel}`);
    channelButtons.push(`<a href="${telegramChannel}" class="btn telegram">Join Telegram</a>`);
  }
  if (whatsappChannel) {
    channelLinks.push(`WhatsApp: ${whatsappChannel}`);
    channelButtons.push(`<a href="${whatsappChannel}" class="btn whatsapp">Join WhatsApp</a>`);
  }

  const communitySection = channelButtons.length
    ? `
    <p>Join our community to connect with fellow students and get updates:</p>
    ${channelButtons.join('\n    ')}
    `
    : '';

  const body = `
    <p>Hi ${fullName},</p>
    <p>You have successfully enrolled in <strong>${courseTitle}</strong>.</p>
    ${communitySection}
    <hr class="divider" />
    <p class="note">If you have any questions, reach out to our support team.</p>
  `;

  const textLines = [
    `Hi ${fullName}, you have successfully enrolled in ${courseTitle}.`,
    ...(channelLinks.length ? ['Join our community:', ...channelLinks] : []),
  ];

  await sendMail({
    to,
    subject: `You're enrolled in ${courseTitle}`,
    html: layout('Enrollment Confirmed', body),
    text: textLines.join(' '),
  });
};
