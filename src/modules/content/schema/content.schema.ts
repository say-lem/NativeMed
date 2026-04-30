import { z } from 'zod';

export const uploadContentSchema = z.object({
  title: z.string().min(2).trim(),
  type: z.enum(['video', 'audio', 'pdf']),
  order: z.coerce.number().int().min(0).default(0),
  duration: z.coerce.number().int().min(0).optional(),
});

export const updateContentSchema = z.object({
  title: z.string().min(2).trim().optional(),
  order: z.coerce.number().int().min(0).optional(),
  duration: z.coerce.number().int().min(0).optional(),
});

export type UploadContentInput = z.infer<typeof uploadContentSchema>;
export type UpdateContentInput = z.infer<typeof updateContentSchema>;