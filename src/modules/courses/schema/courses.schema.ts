import { z } from 'zod';
import { extractDriveId } from '../../../shared/utils/googleDrive';

const gbpPrice = z.coerce.number().min(0);

const driveFolderLink = z
  .string()
  .min(1, 'Drive folder link or ID is required')
  .refine((val) => extractDriveId(val) !== null, {
    message: 'Invalid Google Drive folder link or ID',
  })
  .transform((val) => extractDriveId(val)!);

const tierPricingRefine = (
  data: { monthly?: number; quarterly?: number },
  ctx: z.RefinementCtx,
) => {
  if (data.monthly === undefined && data.quarterly === undefined) {
    ctx.addIssue({
      code: 'custom',
      message: 'At least one of monthly or quarterly price is required for this tier',
      path: ['monthly'],
    });
  }
};

const requiredTierPricing = z
  .object({
    monthly: gbpPrice.optional(),
    quarterly: gbpPrice.optional(),
  })
  .superRefine(tierPricingRefine);

const optionalTierPricing = z.object({
  monthly: gbpPrice.optional(),
  quarterly: gbpPrice.optional(),
});

const communityChannelLink = z
  .string()
  .trim()
  .url('Must be a valid URL')
  .nullable()
  .optional();

export const createCourseSchema = z.object({
  title: z.string().min(3).trim(),
  description: z.string().min(10).trim(),
  pricing: z.object({
    mocksessions_only: requiredTierPricing,
    mocksession_and_lectures: requiredTierPricing,
  }),
  isPublished: z.boolean().optional(),
  // Accept a full Drive folder URL or the raw folder ID — extracted server-side.
  lecturesDriveFolderId: driveFolderLink,
  mockSessionsDriveFolderId: driveFolderLink,
  // Community invite links — emailed to users when they enroll.
  telegramChannel: communityChannelLink,
  whatsappChannel: communityChannelLink,
});

export const updateCourseSchema = z.object({
  title: z.string().min(3).trim().optional(),
  description: z.string().min(10).trim().optional(),
  pricing: z
    .object({
      mocksessions_only: optionalTierPricing.optional(),
      mocksession_and_lectures: optionalTierPricing.optional(),
    })
    .optional(),
  isPublished: z.boolean().optional(),
  lecturesDriveFolderId: driveFolderLink.optional(),
  mockSessionsDriveFolderId: driveFolderLink.optional(),
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
