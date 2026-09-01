import { z } from 'zod';

// Month/year the exam was passed, e.g. "03/26"
const datePassedField = z
  .string()
  .trim()
  .regex(/^(0[1-9]|1[0-2])\/\d{2}$/, 'datePassed must be in MM/YY format');

export const createReviewSchema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(100),
  examSat: z.string().trim().min(2, 'Exam sat is required').max(100),
  datePassed: datePassedField,
  rating: z.number().int('Rating must be a whole number').min(1, 'Rating must be at least 1').max(5, 'Rating must be at most 5'),
  review: z.string().trim().min(10, 'Review must be at least 10 characters').max(2000),
});

export type CreateReviewInput = z.infer<typeof createReviewSchema>;

// Admin edit — only makes sense while the review is still pending (see service).
export const updateReviewSchema = z
  .object({
    name: z.string().trim().min(2, 'Name is required').max(100).optional(),
    examSat: z.string().trim().min(2, 'Exam sat is required').max(100).optional(),
    datePassed: datePassedField.optional(),
    rating: z.number().int('Rating must be a whole number').min(1).max(5).optional(),
    review: z.string().trim().min(10, 'Review must be at least 10 characters').max(2000).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided' });

export type UpdateReviewInput = z.infer<typeof updateReviewSchema>;
