jest.mock('../../../shared/services/email.service', () => ({
  sendMail: jest.fn().mockResolvedValue(undefined),
}));

import { sendBookingNotificationEmail } from './booking.email.service';
import { sendMail } from '../../../shared/services/email.service';

const mockedSendMail = sendMail as jest.MockedFunction<typeof sendMail>;

describe('booking.email.service', () => {
  beforeEach(() => {
    mockedSendMail.mockClear();
  });

  describe('sendBookingNotificationEmail', () => {
    const params = {
      productTitle: 'Career Coaching Session',
      date: new Date('2026-03-05T00:00:00.000Z'),
      time: '14:30',
      bookedByName: 'Grace Hopper',
      bookedByEmail: 'grace@example.com',
    };

    it('attaches a valid .ics calendar invite for the booked date/time', async () => {
      await sendBookingNotificationEmail(params);

      const call = mockedSendMail.mock.calls[0][0];
      expect(call.attachments).toHaveLength(1);
      const ics = call.attachments![0].content;

      expect(call.attachments![0].filename).toBe('booking.ics');
      expect(ics).toContain('BEGIN:VCALENDAR');
      expect(ics).toContain('BEGIN:VEVENT');
      expect(ics).toContain('DTSTART:20260305T143000Z');
      expect(ics).toContain('DTEND:20260305T153000Z'); // defaults to a 1-hour session
      expect(ics).toContain('SUMMARY:Career Coaching Session — one-on-one session');
      expect(ics).toContain('END:VEVENT');
      expect(ics).toContain('END:VCALENDAR');
    });

    it('escapes commas/semicolons in the description so the .ics stays valid', async () => {
      await sendBookingNotificationEmail({
        ...params,
        bookedByName: 'Grace, PhD; Hopper',
      });

      const ics = mockedSendMail.mock.calls[0][0].attachments![0].content;
      expect(ics).toContain('Grace\\, PhD\\; Hopper');
    });

    it('sends to CONTACT_EMAIL_TO with the booker as replyTo', async () => {
      await sendBookingNotificationEmail(params);

      const call = mockedSendMail.mock.calls[0][0];
      expect(call.replyTo).toBe(params.bookedByEmail);
      expect(call.subject).toContain(params.productTitle);
    });
  });
});
