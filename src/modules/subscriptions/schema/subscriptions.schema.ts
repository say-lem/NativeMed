import { z } from 'zod';

const mongoId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid ID');

export const courseIdParamsSchema = z.object({
  courseId: mongoId,
});

export const changePlanSchema = z.object({
  interval: z.enum(['monthly', 'quarterly']),
});

export type CourseIdParams = z.infer<typeof courseIdParamsSchema>;
export type ChangePlanInput = z.infer<typeof changePlanSchema>;
