import { z } from 'zod';

export const createActivitySchema = z.object({
  date: z.coerce.date({ message: 'A valid date is required' }),
  description: z.string().trim().min(5, 'Description must be at least 5 characters').max(2000),
});

export type CreateActivityInput = z.infer<typeof createActivitySchema>;

export const updateActivitySchema = z
  .object({
    date: z.coerce.date({ message: 'A valid date is required' }).optional(),
    description: z.string().trim().min(5, 'Description must be at least 5 characters').max(2000).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided' });

export type UpdateActivityInput = z.infer<typeof updateActivitySchema>;
