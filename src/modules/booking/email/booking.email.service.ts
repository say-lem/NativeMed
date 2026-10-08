import crypto from 'crypto';
import { env } from '../../../config/env';
import { sendMail } from '../../../shared/services/email.service';
import { renderEmailLayout, escapeHtml } from '../../../shared/services/emailLayout.service';

const layout = (title: string, body: string): string =>
  renderEmailLayout({ title, subtitle: 'One-on-One Booking', body });

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
    'PRODID:-//Native Medical Education//Booking//EN',
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

// ── Slot availability request — sent to the admin when a user asks to be ──
// ── contacted about a session that currently has no open date/time ─────────

export const sendSlotAvailabilityRequestEmail = async (params: {
  productTitle: string;
  name: string;
  email: string;
  examSitting: string;
  preferredDates: Date[];
}): Promise<void> => {
  const safeTitle = escapeHtml(params.productTitle);
  const safeName = escapeHtml(params.name);
  const safeEmail = escapeHtml(params.email);
  const safeExamSitting = escapeHtml(params.examSitting);
  const datesLabel = params.preferredDates.map(formatDate).join(', ');

  const body = `
    <p>A user has asked to be contacted about a one-on-one session with no open slots.</p>
    <p><strong>Session:</strong> ${safeTitle}<br/>
    <strong>Exam sitting:</strong> ${safeExamSitting}<br/>
    <strong>Preferred date(s):</strong> ${datesLabel}</p>
    <hr class="divider" />
    <p><strong>Name:</strong> ${safeName}<br/>
    <strong>Email:</strong> ${safeEmail}</p>
    <p class="note">Reply directly to this email to respond to ${safeName}.</p>
  `;

  await sendMail({
    to: env.CONTACT_EMAIL_TO ?? env.EMAIL_FROM_ADDRESS,
    replyTo: params.email,
    subject: `Slot request: ${params.productTitle} — no availability`,
    html: layout('Session Availability Request', body),
    text: `Availability request for ${params.productTitle}.\nExam sitting: ${params.examSitting}\nPreferred date(s): ${datesLabel}\nName: ${params.name}\nEmail: ${params.email}`,
  });
};
