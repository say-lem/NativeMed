import { env } from '../../../config/env';
import { sendMail } from '../../../shared/services/email.service';
import { renderEmailLayout } from '../../../shared/services/emailLayout.service';

const layout = (title: string, body: string): string =>
  renderEmailLayout({
    title,
    subtitle: 'Medical Education Platform',
    body,
    footerNote: 'If you did not request this email, you can safely ignore it.',
  });

// ── Welcome email (sent after registration) ───────────────────────────────────

export const sendWelcomeEmail = async (
  to: string,
  fullName: string,
): Promise<void> => {
  const body = `
    <p>Hi ${fullName},</p>
    <p>Welcome to <strong>Native Med</strong>! Your account has been created successfully.</p>
    <p>You can now log in and explore available courses, mock cases and the question bank.</p>
    <a href="${env.CLIENT_URL}/login" class="btn block">Go to your dashboard</a>
    <hr class="divider" />
    <p class="note">If you have any questions, reach out to our support team at info@nativemeded.co.uk.</p>
  `;

  await sendMail({
    to,
    subject: 'Welcome to Native Med ',
    html: layout('Welcome to Native Med', body),
    text: `Hi ${fullName}, welcome to Native Med! Your account has been created. Log in at ${env.CLIENT_URL}/login`,
  });
};

// ── Password reset email ──────────────────────────────────────────────────────

export const sendPasswordResetEmail = async (
  to: string,
  fullName: string,
  resetToken: string,
): Promise<void> => {
  const resetUrl = `${env.CLIENT_URL}/reset-password?token=${resetToken}`;
  const expiresMinutes = env.RESET_TOKEN_EXPIRES_MINUTES;

  const body = `
    <p>Hi ${fullName},</p>
    <p>We received a request to reset your <strong>Native Med</strong> password.</p>
    <p>Click the button below to choose a new password. This link expires in <strong>${expiresMinutes} minutes</strong>.</p>
    <a href="${resetUrl}" class="btn block">Reset your password</a>
    <hr class="divider" />
    <p class="note">If the button doesn't work, copy and paste this URL into your browser:</p>
    <p class="note">${resetUrl}</p>
    <p class="note">If you did not request a password reset, no action is needed — your account is safe.</p>
  `;

  await sendMail({
    to,
    subject: 'Reset your Native Med password',
    html: layout('Password Reset', body),
    text: `Hi ${fullName}, reset your password here: ${resetUrl} (expires in ${expiresMinutes} minutes)`,
    containsSensitiveData: true, // reset link contains the raw token — never log it
  });
};

// ── Password changed confirmation ─────────────────────────────────────────────

export const sendPasswordChangedEmail = async (
  to: string,
  fullName: string,
): Promise<void> => {
  const body = `
    <p>Hi ${fullName},</p>
    <p>This is a confirmation that your <strong>Native Med</strong> password was successfully changed.</p>
    <p>All active sessions have been signed out for your security.</p>
    <hr class="divider" />
    <p class="note">If you did not make this change, please reset your password immediately or contact our support team.</p>
    <a href="${env.CLIENT_URL}/forgot-password" class="btn block">Reset password</a>
  `;

  await sendMail({
    to,
    subject: 'Your Native Med password was changed',
    html: layout('Password Changed', body),
    text: `Hi ${fullName}, your Native Med password was changed. If this wasn't you, reset it at ${env.CLIENT_URL}/forgot-password`,
  });
};

// ── Admin welcome email (sent when admin creates another admin) ───────────────

export const sendAdminWelcomeEmail = async (
  to: string,
  fullName: string,
  temporaryPassword: string,
): Promise<void> => {
  const body = `
    <p>Hi ${fullName},</p>
    <p>An administrator has created an <strong>admin account</strong> for you on Native Med.</p>
    <p>Use the credentials below to log in. You will be prompted to change your password on first login.</p>
    <p><strong>Email:</strong> ${to}<br/><strong>Temporary password:</strong> ${temporaryPassword}</p>
    <a href="${env.CLIENT_URL}/login" class="btn block">Log in to Native Med</a>
    <hr class="divider" />
    <p class="note">For security, please change your password immediately after logging in.</p>
  `;

  await sendMail({
    to,
    subject: 'Your Native Med admin account',
    html: layout('Admin Account Created', body),
    text: `Hi ${fullName}, your Native Med admin account has been created. Email: ${to}, Temporary password: ${temporaryPassword}. Log in at ${env.CLIENT_URL}/login`,
    containsSensitiveData: true, // contains temporary password — never log it
  });
};