import { z } from 'zod';

export const createCourseSchema = z.object({
  title: z.string().min(3).trim(),
  description: z.string().min(10).trim(),
  price: z.coerce.number().min(0),
  isPublished: z.boolean().optional(),
  // Google Drive folder ID — admin copies this from the Drive folder URL
  // e.g. https://drive.google.com/drive/folders/<THIS_PART>
  driveFolderId: z.string().min(10, 'Invalid Drive folder ID').optional(),
});

export const updateCourseSchema = createCourseSchema.partial();

export const courseIdSchema = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid course ID'),
});

export const courseFilterSchema = z.object({
  search: z.string().trim().optional(),
  page:   z.coerce.number().int().min(1).default(1),
  limit:  z.coerce.number().int().min(1).max(50).default(20),
});

export type CreateCourseInput = z.infer<typeof createCourseSchema>;
export type UpdateCourseInput = z.infer<typeof updateCourseSchema>;
export type CourseFilterInput = z.infer<typeof courseFilterSchema>;