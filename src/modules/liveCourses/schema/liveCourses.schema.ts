import { z } from 'zod';
import { gbpPrice, driveFolderLink, communityChannelLink } from '../../courses/schema/courses.schema';

export const createLiveCourseSchema = z.object({
  title: z.string().min(3).trim(),
  description: z.string().min(10).trim(),
  detailedDescription: z.string().min(10).trim().optional(),
  price: gbpPrice,
  startDate: z.coerce.date({ message: 'A valid start date is required' }),
  endDate: z.coerce.date({ message: 'A valid end date is required' }),
  isPublished: z.boolean().optional(),
  // Accept a full Drive folder URL or the raw folder ID — extracted server-side.
  driveFolderId: driveFolderLink,
  // Community invite links — emailed to users when they purchase.
  telegramChannel: communityChannelLink,
  whatsappChannel: communityChannelLink,
}).refine((data) => data.endDate > data.startDate, {
  message: 'endDate must be after startDate',
  path: ['endDate'],
});

export const updateLiveCourseSchema = z.object({
  title: z.string().min(3).trim().optional(),
  description: z.string().min(10).trim().optional(),
  detailedDescription: z.string().min(10).trim().optional(),
  price: gbpPrice.optional(),
  startDate: z.coerce.date({ message: 'A valid start date is required' }).optional(),
  endDate: z.coerce.date({ message: 'A valid end date is required' }).optional(),
  isPublished: z.boolean().optional(),
  driveFolderId: driveFolderLink.optional(),
  telegramChannel: communityChannelLink,
  whatsappChannel: communityChannelLink,
}).refine(
  (data) => !(data.startDate && data.endDate) || data.endDate > data.startDate,
  { message: 'endDate must be after startDate', path: ['endDate'] },
);

export const purchaseLiveCourseSchema = z.object({
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});

export const liveCourseIdSchema = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid live course ID'),
});

export const liveCourseFilterSchema = z.object({
  search: z.string().trim().optional(),
  page:   z.coerce.number().int().min(1).default(1),
  limit:  z.coerce.number().int().min(1).max(50).default(20),
});

const mongoId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid ID');

export const manualEnrollLiveCourseSchema = z.object({
  userId: mongoId,
});

export const revokeLiveCourseEnrollmentSchema = z.object({
  userId: mongoId,
});

export const restoreLiveCourseEnrollmentSchema = z.object({
  enrollmentId: mongoId,
});

export type CreateLiveCourseInput  = z.infer<typeof createLiveCourseSchema>;
export type UpdateLiveCourseInput  = z.infer<typeof updateLiveCourseSchema>;
export type PurchaseLiveCourseInput = z.infer<typeof purchaseLiveCourseSchema>;
export type LiveCourseFilterInput  = z.infer<typeof liveCourseFilterSchema>;
export type ManualEnrollLiveCourseInput = z.infer<typeof manualEnrollLiveCourseSchema>;
export type RevokeLiveCourseEnrollmentInput = z.infer<typeof revokeLiveCourseEnrollmentSchema>;
export type RestoreLiveCourseEnrollmentInput = z.infer<typeof restoreLiveCourseEnrollmentSchema>;
