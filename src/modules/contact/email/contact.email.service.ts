import { env } from '../../../config/env';
import { sendMail } from '../../../shared/services/email.service';
import { renderEmailLayout, escapeHtml } from '../../../shared/services/emailLayout.service';
import { ContactMessageInput } from '../schema/contact.schema';

const layout = (title: string, body: string): string =>
  renderEmailLayout({ title, subtitle: 'Contact Form Submission', body });

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
    <p>You've received a new message from the Native Medical Education contact form.</p>
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
