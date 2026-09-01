jest.mock('../../../shared/services/email.service');

import { sendMail } from '../../../shared/services/email.service';
import { submitContactMessage } from './contact.service';

const mockedSendMail = sendMail as jest.MockedFunction<typeof sendMail>;

describe('contact.service', () => {
  beforeEach(() => {
    mockedSendMail.mockClear();
  });

  it('relays the message to the contact inbox by email, nothing persisted', async () => {
    await submitContactMessage({
      fullName: 'Jane Doe',
      email: 'jane@example.com',
      message: 'I have a question about the mock sessions schedule.',
    });

    expect(mockedSendMail).toHaveBeenCalledTimes(1);
    const call = mockedSendMail.mock.calls[0][0];
    expect(call.replyTo).toBe('jane@example.com');
    expect(call.subject).toContain('Jane Doe');
    expect(call.html).toContain('mock sessions schedule');
  });

  it('HTML-escapes user-supplied fields to prevent injection into the email body', async () => {
    await submitContactMessage({
      fullName: '<script>alert(1)</script>',
      email: 'attacker@example.com',
      message: 'Message with <b>markup</b> in it.',
    });

    const call = mockedSendMail.mock.calls[0][0];
    expect(call.html).not.toContain('<script>alert(1)</script>');
    expect(call.html).toContain('&lt;script&gt;');
  });
});
