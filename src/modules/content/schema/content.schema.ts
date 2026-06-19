import { z } from 'zod';

// ── PDF upload schema (used when admin uploads a PDF via multipart/form-data) ─
export const uploadPdfSchema = z.object({
  title: z.string().min(2).trim(),
  order: z.coerce.number().int().min(0).default(0),
  type:  z.literal('pdf').default('pdf'),
});

// ── Video / Audio schema (admin pastes the Google Drive share link) ───────────
// No file upload — the admin manually adds these to Google Drive and provides
// the shareable link here so it appears in the course content list.
export const addDriveLinkSchema = z.object({
  title:    z.string().min(2).trim(),
  type:     z.enum(['video', 'audio']),
  fileUrl:  z.string().url('Must be a valid Google Drive share link'),
  order:    z.coerce.number().int().min(0).default(0),
  duration: z.coerce.number().int().min(0).optional(), // seconds
});

// ── Update schema (metadata only — never re-uploads the file) ────────────────
export const updateContentSchema = z.object({
  title:    z.string().min(2).trim().optional(),
  order:    z.coerce.number().int().min(0).optional(),
  duration: z.coerce.number().int().min(0).optional(),
});

export type UploadPdfInput     = z.infer<typeof uploadPdfSchema>;
export type AddDriveLinkInput  = z.infer<typeof addDriveLinkSchema>;
export type UpdateContentInput = z.infer<typeof updateContentSchema>;