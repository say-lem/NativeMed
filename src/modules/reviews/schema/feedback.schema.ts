import { z } from 'zod';

export const createFeedbackSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  message: z.string().trim().min(5, 'Message must be at least 5 characters').max(2000),
});

export type CreateFeedbackInput = z.infer<typeof createFeedbackSchema>;
