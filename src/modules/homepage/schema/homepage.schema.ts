import { z } from 'zod';

const youtubeUrlField = z
  .string()
  .trim()
  .url('Must be a valid URL')
  .regex(/^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//, 'Must be a YouTube link');

export const updateHomepageStatsSchema = z
  .object({
    testimonialsCount: z.number().int().min(0, 'testimonialsCount cannot be negative').optional(),
    registrarsCount: z.number().int().min(0, 'registrarsCount cannot be negative').optional(),
    contactEmail: z.string().trim().email('Must be a valid email').optional(),
    contactPhone: z.string().trim().min(7, 'Invalid phone number').max(20).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided' });

export type UpdateHomepageStatsInput = z.infer<typeof updateHomepageStatsSchema>;

export const createYoutubeLinkSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  url: youtubeUrlField,
  order: z.number().int().min(0).optional(),
});

export type CreateYoutubeLinkInput = z.infer<typeof createYoutubeLinkSchema>;

export const updateYoutubeLinkSchema = z
  .object({
    title: z.string().trim().min(1, 'Title is required').max(200).optional(),
    url: youtubeUrlField.optional(),
    order: z.number().int().min(0).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided' });

export type UpdateYoutubeLinkInput = z.infer<typeof updateYoutubeLinkSchema>;

export const createFaqSchema = z.object({
  question: z.string().trim().min(1, 'Question is required').max(500),
  answer: z.string().trim().min(1, 'Answer is required').max(5000),
  order: z.number().int().min(0).optional(),
});

export type CreateFaqInput = z.infer<typeof createFaqSchema>;

export const updateFaqSchema = z
  .object({
    question: z.string().trim().min(1, 'Question is required').max(500).optional(),
    answer: z.string().trim().min(1, 'Answer is required').max(5000).optional(),
    order: z.number().int().min(0).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided' });

export type UpdateFaqInput = z.infer<typeof updateFaqSchema>;

export const updateTermsAndConditionsSchema = z.object({
  content: z.string().trim().min(1, 'Content is required').max(20000),
});

export type UpdateTermsAndConditionsInput = z.infer<typeof updateTermsAndConditionsSchema>;

export const updateLegalDisclaimerSchema = z.object({
  content: z.string().trim().min(1, 'Content is required').max(20000),
});

export type UpdateLegalDisclaimerInput = z.infer<typeof updateLegalDisclaimerSchema>;
