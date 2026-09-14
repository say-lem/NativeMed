import crypto from 'crypto';
import { env } from '../../../config/env';
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
    .note { font-size: 13px !important; color: #71717a !important; }
    .divider { border: none; border-top: 1px solid #e4e4e7; margin: 24px 0; }
    .footer { background: #fafafa; padding: 20px 40px; text-align: center; font-size: 12px; color: #a1a1aa; border-top: 1px solid #e4e4e7; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>Native Med</h1>
      <p>One-on-One Booking</p>
    </div>
    <div class="body">${body}</div>
    <div class="footer">
      &copy; ${new Date().getFullYear()} Native Med. All rights reserved.
    </div>
  </div>
</body>
</html>
`;

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const formatDate = (date: Date): string =>
  date.toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });

// ─────────────────────────────────────────────────────────────────────────────
// .ics calendar attachment — most mail clients (Gmail, Outlook, Apple Mail)
// render this as an "Add to calendar" prompt automatically.
//
// BookingProduct has no session-length field, so the event defaults to a
// fixed 1-hour duration — informational only, doesn't affect booking logic.
// ─────────────────────────────────────────────────────────────────────────────

const SESSION_DURATION_MINUTES = 60;

const formatIcsDate = (date: Date): string => date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

const escapeIcsText = (value: string): string =>
  value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

const buildBookingIcs = (params: {
  title: string;
  description: string;
  date: Date;
  time: string;
}): string => {
  const [hours, minutes] = params.time.split(':').map(Number);
  const start = new Date(params.date);
  start.setUTCHours(hours, minutes, 0, 0);
  const end = new Date(start.getTime() + SESSION_DURATION_MINUTES * 60 * 1000);

  const uid = `${crypto.randomUUID()}@nativemed.com`;

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Native Med//Booking//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${formatIcsDate(new Date())}`,
    `DTSTART:${formatIcsDate(start)}`,
    `DTEND:${formatIcsDate(end)}`,
    `SUMMARY:${escapeIcsText(params.title)}`,
    `DESCRIPTION:${escapeIcsText(params.description)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
};

// ── New booking notification — sent to the admin the moment a slot is booked ──

export const sendBookingNotificationEmail = async (params: {
  productTitle: string;
  date: Date;
  time: string;
  bookedByName: string;
  bookedByEmail: string;
}): Promise<void> => {
  const safeTitle = escapeHtml(params.productTitle);
  const safeName = escapeHtml(params.bookedByName);
  const safeEmail = escapeHtml(params.bookedByEmail);
  const dateLabel = formatDate(params.date);

  const body = `
    <p>A new one-on-one session has been booked.</p>
    <p><strong>Session:</strong> ${safeTitle}<br/>
    <strong>Date:</strong> ${dateLabel}<br/>
    <strong>Time:</strong> ${params.time}</p>
    <hr class="divider" />
    <p><strong>Booked by:</strong> ${safeName}<br/>
    <strong>Email:</strong> ${safeEmail}</p>
    <p class="note">A calendar invite for this session is attached — open it to add the booking to your calendar.</p>
  `;

  const ics = buildBookingIcs({
    title: `${params.productTitle} — one-on-one session`,
    description: `Booked by ${params.bookedByName} (${params.bookedByEmail}).`,
    date: params.date,
    time: params.time,
  });

  await sendMail({
    to: env.CONTACT_EMAIL_TO ?? env.EMAIL_FROM_ADDRESS,
    replyTo: params.bookedByEmail,
    subject: `New booking: ${params.productTitle} — ${dateLabel} at ${params.time}`,
    html: layout('New Booking', body),
    text: `New booking for ${params.productTitle} on ${dateLabel} at ${params.time}. Booked by ${params.bookedByName} (${params.bookedByEmail}).`,
    attachments: [
      {
        filename: 'booking.ics',
        content: ics,
        contentType: 'text/calendar; charset=utf-8; method=PUBLISH',
      },
    ],
  });
};
