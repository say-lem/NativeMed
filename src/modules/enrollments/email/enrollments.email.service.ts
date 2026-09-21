import { sendMail } from '../../../shared/services/email.service';
import { renderEmailLayout } from '../../../shared/services/emailLayout.service';

const layout = (title: string, body: string): string =>
  renderEmailLayout({
    title,
    subtitle: 'Medical Education Platform',
    body,
    footerNote: 'If you did not request this email, you can safely ignore it.',
  });

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
