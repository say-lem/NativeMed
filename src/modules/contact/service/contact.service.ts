import { sendContactMessageEmail } from '../email/contact.email.service';
import { ContactMessageInput } from '../schema/contact.schema';

// No persistence — the message is relayed straight to the contact inbox by email.
export const submitContactMessage = async (input: ContactMessageInput): Promise<void> => {
  await sendContactMessageEmail(input);
};
