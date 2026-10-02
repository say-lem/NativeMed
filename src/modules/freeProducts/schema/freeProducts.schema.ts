import { z } from 'zod';

// ── Link product — admin pastes a URL to the material ─────────────────────────
export const createLinkFreeProductSchema = z.object({
  title:       z.string().trim().min(2, 'Title is required').max(200),
  description: z.string().trim().min(5, 'Description must be at least 5 characters').max(2000),
  fileUrl:     z.string().url('Must be a valid URL'),
  order:       z.coerce.number().int().min(0).default(0),
});

export type CreateLinkFreeProductInput = z.infer<typeof createLinkFreeProductSchema>;

// ── PDF product — admin uploads a PDF via multipart/form-data ────────────────
export const uploadPdfFreeProductSchema = z.object({
  title:       z.string().trim().min(2, 'Title is required').max(200),
  description: z.string().trim().min(5, 'Description must be at least 5 characters').max(2000),
  order:       z.coerce.number().int().min(0).default(0),
});

export type UploadPdfFreeProductInput = z.infer<typeof uploadPdfFreeProductSchema>;

// ── PDF product — direct-upload variant: admin already uploaded the file
// directly to Cloudinary from the browser (see uploads.route.ts) and is now
// just registering the resulting asset ───────────────────────────────────────
export const registerPdfFreeProductSchema = z.object({
  title:       z.string().trim().min(2, 'Title is required').max(200),
  description: z.string().trim().min(5, 'Description must be at least 5 characters').max(2000),
  fileUrl:     z.string().url(),
  publicId:    z.string().min(1),
  order:       z.coerce.number().int().min(0).default(0),
});

export type RegisterPdfFreeProductInput = z.infer<typeof registerPdfFreeProductSchema>;

// ── Blog product — cover image (multipart) + title + written content ─────────
// This is expected to be the common case; description is optional since the
// content itself carries the material.
export const uploadBlogFreeProductSchema = z.object({
  title:       z.string().trim().min(2, 'Title is required').max(200),
  content:     z.string().trim().min(20, 'Content must be at least 20 characters').max(20000),
  description: z.string().trim().min(5, 'Description must be at least 5 characters').max(2000).optional(),
  order:       z.coerce.number().int().min(0).default(0),
});

export type UploadBlogFreeProductInput = z.infer<typeof uploadBlogFreeProductSchema>;

// ── Update — metadata only; a PDF/cover image is never replaced in place here ─
export const updateFreeProductSchema = z
  .object({
    title:       z.string().trim().min(2, 'Title is required').max(200).optional(),
    description: z.string().trim().min(5, 'Description must be at least 5 characters').max(2000).optional(),
    // Only meaningful for type: link — rejected server-side for type: pdf/blog.
    fileUrl:     z.string().url('Must be a valid URL').optional(),
    // Only meaningful for type: blog — rejected server-side otherwise.
    content:     z.string().trim().min(20, 'Content must be at least 20 characters').max(20000).optional(),
    order:       z.coerce.number().int().min(0).optional(),
    isPublished: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided' });

export type UpdateFreeProductInput = z.infer<typeof updateFreeProductSchema>;
