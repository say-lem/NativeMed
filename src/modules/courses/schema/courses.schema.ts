import { z } from 'zod';
import { extractDriveId } from '../../../shared/utils/googleDrive';

export const gbpPrice = z.coerce.number().min(0);

export const driveFolderLink = z
  .string()
  .min(1, 'Drive folder link or ID is required')
  .refine((val) => extractDriveId(val) !== null, {
    message: 'Invalid Google Drive folder link or ID',
  })
  .transform((val) => extractDriveId(val)!);

const coursePricingRefine = (
  data: { monthly?: number; quarterly?: number },
  ctx: z.RefinementCtx,
) => {
  if (data.monthly === undefined && data.quarterly === undefined) {
    ctx.addIssue({
      code: 'custom',
      message: 'At least one of monthly or quarterly price is required',
      path: ['monthly'],
    });
  }
};

const requiredCoursePricing = z
  .object({
    monthly: gbpPrice.optional(),
    quarterly: gbpPrice.optional(),
  })
  .superRefine(coursePricingRefine);

const optionalCoursePricing = z.object({
  monthly: gbpPrice.optional(),
  quarterly: gbpPrice.optional(),
});

export const communityChannelLink = z
  .string()
  .trim()
  .url('Must be a valid URL')
  .nullable()
  .optional();

export const createCourseSchema = z.object({
  title: z.string().min(3).trim(),
  description: z.string().min(10).trim(),
  detailedDescription: z.string().min(10).trim().optional(),
  pricing: requiredCoursePricing,
  isPublished: z.boolean().optional(),
  // Accept a full Drive folder URL or the raw folder ID — extracted server-side.
  driveFolderId: driveFolderLink,
  // Community invite links — emailed to users when they enroll.
  telegramChannel: communityChannelLink,
  whatsappChannel: communityChannelLink,
});

export const updateCourseSchema = z.object({
  title: z.string().min(3).trim().optional(),
  description: z.string().min(10).trim().optional(),
  detailedDescription: z.string().min(10).trim().optional(),
  pricing: optionalCoursePricing.optional(),
  isPublished: z.boolean().optional(),
  driveFolderId: driveFolderLink.optional(),
  telegramChannel: communityChannelLink,
  whatsappChannel: communityChannelLink,
});

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
