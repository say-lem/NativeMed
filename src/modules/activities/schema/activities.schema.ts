import { z } from 'zod';

export const createActivitySchema = z.object({
  date: z.coerce.date({ message: 'A valid date is required' }),
  time: z.string().trim().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be in 24-hour HH:mm format').optional(),
  activityType: z.string().trim().min(1).max(100).optional(),
  activityStatus: z.string().trim().min(1).max(100).optional(),
  courseId: z.string().regex(/^[a-fA-F0-9]{24}$/, 'Invalid course ID').nullable().optional(),
  isPublished: z.boolean().optional(),
  description: z.string().trim().min(5, 'Description must be at least 5 characters').max(2000),
});

export type CreateActivityInput = z.infer<typeof createActivitySchema>;

export const updateActivitySchema = createActivitySchema.partial()
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided' });

export type UpdateActivityInput = z.infer<typeof updateActivitySchema>;
