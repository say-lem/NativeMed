import { z } from 'zod';

// Whitelist of PDF destinations the direct-upload flow is allowed to target —
// keeps the client from steering an upload into an unrelated Cloudinary folder.
export const PDF_UPLOAD_TARGETS = ['course-content', 'free-product', 'live-course-toc'] as const;

export type PdfUploadTarget = (typeof PDF_UPLOAD_TARGETS)[number];

export const pdfUploadSignatureSchema = z.object({
  target: z.enum(PDF_UPLOAD_TARGETS),
});

export type PdfUploadSignatureInput = z.infer<typeof pdfUploadSignatureSchema>;
