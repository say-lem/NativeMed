import { z } from 'zod';

const productId = z.string().regex(/^[a-fA-F0-9]{24}$/, 'Invalid product ID');
export const activityProductSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('course'), id: productId }),
  z.object({ type: z.literal('live_course'), id: productId }),
  z.object({ type: z.literal('one_on_one'), id: productId }),
  z.object({ type: z.literal('free_product'), id: productId }),
  z.object({ type: z.literal('case_bank'), id: z.never().optional() }),
]);

const activityFields = z.object({
  date: z.coerce.date({ message: 'A valid date is required' }),
  time: z.string().trim().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be in 24-hour HH:mm format').optional(),
  activityType: z.string().trim().min(1).max(100).optional(),
  activityStatus: z.string().trim().min(1).max(100).optional(),
  product: activityProductSchema.nullable().optional(),
  courseId: z.string().regex(/^[a-fA-F0-9]{24}$/, 'Invalid course ID').nullable().optional(),
  isPublished: z.boolean().optional(),
  description: z.string().trim().min(5, 'Description must be at least 5 characters').max(2000),
});

export const createActivitySchema = activityFields.refine((data) => data.product === undefined || data.courseId === undefined, {
  message: 'Provide product or courseId, not both',
});

export type CreateActivityInput = z.infer<typeof createActivitySchema>;

export const updateActivitySchema = activityFields.partial().refine((data) => data.product === undefined || data.courseId === undefined, { message: 'Provide product or courseId, not both' })
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided' });

export type UpdateActivityInput = z.infer<typeof updateActivitySchema>;
