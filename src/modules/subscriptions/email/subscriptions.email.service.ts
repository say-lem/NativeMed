import { sendMail } from '../../../shared/services/email.service';
import { renderEmailLayout } from '../../../shared/services/emailLayout.service';

const layout = (title: string, body: string): string =>
  renderEmailLayout({
    title,
    subtitle: 'Medical Education Platform',
    body,
    footerNote: 'If you did not request this email, you can safely ignore it.',
  });

// Reused for every event that grants/restores Case Bank access — Stripe
// checkout, admin manual grant, and admin restore-after-revoke all resolve
// to the same "you have access" state, same pattern as sendEnrollmentEmail
// being reused across course purchase/manual-enroll/restore.
export const sendCaseBankAccessGrantedEmail = async (
  to: string,
  fullName: string,
): Promise<void> => {
  const body = `
    <p>Hi ${fullName},</p>
    <p>You now have access to <strong>Case Bank</strong> on Native Med.</p>
    <p>Log in to start practicing mock cases and the question bank.</p>
    <hr class="divider" />
    <p class="note">If you have any questions, reach out to our support team.</p>
  `;

  await sendMail({
    to,
    subject: 'Your Case Bank access is active',
    html: layout('Case Bank Access', body),
    text: `Hi ${fullName}, you now have access to Case Bank on Native Med.`,
  });
};

// Reused for every event that ends Case Bank access — natural Stripe expiry/
// cancellation/refund and admin revoke.
export const sendCaseBankAccessEndedEmail = async (
  to: string,
  fullName: string,
): Promise<void> => {
  const body = `
    <p>Hi ${fullName},</p>
    <p>Your access to <strong>Case Bank</strong> on Native Med has ended.</p>
    <p>You can resubscribe at any time to regain access.</p>
    <hr class="divider" />
    <p class="note">If you have any questions, reach out to our support team.</p>
  `;

  await sendMail({
    to,
    subject: 'Your Case Bank access has ended',
    html: layout('Case Bank Access Ended', body),
    text: `Hi ${fullName}, your Case Bank access on Native Med has ended.`,
  });
};
