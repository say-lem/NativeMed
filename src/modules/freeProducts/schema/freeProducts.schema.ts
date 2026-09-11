import { z } from 'zod';

// ── Link product — admin pastes a URL to the material ─────────────────────────
export const createLinkFreeProductSchema = z.object({
  title:       z.string().trim().min(2, 'Title is required').max(200),
  description: z.string().trim().min(5, 'Description must be at least 5 characters').max(2000),
  fileUrl:     z.string().url('Must be a valid URL'),
});

export type CreateLinkFreeProductInput = z.infer<typeof createLinkFreeProductSchema>;

// ── PDF product — admin uploads a PDF via multipart/form-data ────────────────
export const uploadPdfFreeProductSchema = z.object({
  title:       z.string().trim().min(2, 'Title is required').max(200),
  description: z.string().trim().min(5, 'Description must be at least 5 characters').max(2000),
  order:       z.coerce.number().int().min(0).default(0),
});

export type UploadPdfFreeProductInput = z.infer<typeof uploadPdfFreeProductSchema>;

// ── Update — metadata only; a PDF file is never replaced in place ────────────
export const updateFreeProductSchema = z
  .object({
    title:       z.string().trim().min(2, 'Title is required').max(200).optional(),
    description: z.string().trim().min(5, 'Description must be at least 5 characters').max(2000).optional(),
    // Only meaningful for type: link — rejected server-side for type: pdf.
    fileUrl:     z.string().url('Must be a valid URL').optional(),
    order:       z.coerce.number().int().min(0).optional(),
    isPublished: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided' });

export type UpdateFreeProductInput = z.infer<typeof updateFreeProductSchema>;
