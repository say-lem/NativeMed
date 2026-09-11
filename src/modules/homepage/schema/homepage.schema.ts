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
