import { z } from 'zod';

const mongoId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid ID');

export const courseIdParamsSchema = z.object({
  courseId: mongoId,
});

export const changePlanSchema = z.object({
  interval: z.enum(['monthly', 'quarterly']),
});

export const manualGrantCaseBankSchema = z.object({
  userId: mongoId,
  durationDays: z.number().int().min(1).max(3650),
});

export const revokeCaseBankSchema = z.object({
  userId: mongoId,
});

export const restoreCaseBankSchema = z.object({
  userId: mongoId,
  durationDays: z.number().int().min(1).max(3650),
});

export type CourseIdParams = z.infer<typeof courseIdParamsSchema>;
export type ChangePlanInput = z.infer<typeof changePlanSchema>;
export type ManualGrantCaseBankInput = z.infer<typeof manualGrantCaseBankSchema>;
export type RevokeCaseBankInput = z.infer<typeof revokeCaseBankSchema>;
export type RestoreCaseBankInput = z.infer<typeof restoreCaseBankSchema>;
