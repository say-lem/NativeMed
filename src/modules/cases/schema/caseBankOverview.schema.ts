import { z } from 'zod';

export const updateCaseBankOverviewSchema = z
  .object({
    title: z.string().trim().min(2, 'Title is required').max(200).optional(),
    description: z.string().trim().min(5, 'Description must be at least 5 characters').max(2000).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided' });

export type UpdateCaseBankOverviewInput = z.infer<typeof updateCaseBankOverviewSchema>;
