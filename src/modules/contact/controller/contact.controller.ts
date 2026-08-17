import { Request, Response } from 'express';
import { asyncHandler } from '../../../shared/middleware/asyncHandler';
import { ApiResponse } from '../../../shared/utils/apiResponse';
import * as contactService from '../service/contact.service';
import { ContactMessageInput } from '../schema/contact.schema';
import { contactMessageQueue } from '../queue/contact.queue';

export const submitContactMessage = asyncHandler(async (req: Request, res: Response) => {
  const input = req.body as ContactMessageInput;
  const key = req.ip ?? 'unknown';

  const accepted = contactMessageQueue.enqueue(key, () => {
    contactService.submitContactMessage(input).catch((err) => {
      console.error('Failed to send contact message email:', err);
    });
  });

  if (!accepted) {
    return ApiResponse.error(res, 'Too many messages sent, please try again later.', 429);
  }

  return ApiResponse.success(res, 'Your message has been received and will be sent shortly', undefined, 202);
});
