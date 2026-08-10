import { z } from 'zod';

const mongoId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid ID');

export const courseIdParamsSchema = z.object({
  courseId: mongoId,
});

export const changePlanSchema = z
  .object({
    tier: z.enum(['mocksessions_only', 'mocksession_and_lectures']).optional(),
    interval: z.enum(['monthly', 'quarterly']).optional(),
  })
  .refine((data) => data.tier !== undefined || data.interval !== undefined, {
    message: 'At least one of tier or interval must be provided',
  });

export type CourseIdParams = z.infer<typeof courseIdParamsSchema>;
export type ChangePlanInput = z.infer<typeof changePlanSchema>;
