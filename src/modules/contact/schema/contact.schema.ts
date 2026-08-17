import { z } from 'zod';

export const contactMessageSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name is required').max(100),
  email: z.string().trim().email('Invalid email address').max(254),
  message: z.string().trim().min(10, 'Message must be at least 10 characters').max(5000),
});

export type ContactMessageInput = z.infer<typeof contactMessageSchema>;
