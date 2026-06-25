import { z } from 'zod';

const mongoId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid ID');

export const courseIdParamsSchema = z.object({
  courseId: mongoId,
});

export type CourseIdParams = z.infer<typeof courseIdParamsSchema>;
