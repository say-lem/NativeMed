// ── Shared email layout ─────────────────────────────────────────────────────
// Single source of truth for the HTML shell used by every transactional email
// (enrollments, auth, booking, contact). Centralizes what used to be four
// byte-for-byte-duplicated `layout()` functions.

export interface RenderEmailLayoutParams {
  title: string;
  subtitle: string;
  body: string;
  // Extra line shown under the copyright notice in the footer (omit for none)
  footerNote?: string;
}

export const renderEmailLayout = ({ title, subtitle, body, footerNote }: RenderEmailLayoutParams): string => `
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
    .btn.block { margin: 24px 0; }
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
      <h1>Native Medical Education</h1>
      <p>${subtitle}</p>
    </div>
    <div class="body">${body}</div>
    <div class="footer">
      &copy; ${new Date().getFullYear()} Native Medical Education. All rights reserved.${footerNote ? `<br/>\n      ${footerNote}` : ''}
    </div>
  </div>
</body>
</html>
`;

// HTML-escape user-supplied values before interpolating them into an email body
export const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
