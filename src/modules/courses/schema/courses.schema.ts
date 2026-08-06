import { z } from 'zod';

const gbpPrice = z.coerce.number().min(0);

const coursePricingRefine = (
  data: { priceMonthly?: number; priceQuarterly?: number },
  ctx: z.RefinementCtx,
) => {
  const hasMonthly = data.priceMonthly !== undefined;
  const hasQuarterly = data.priceQuarterly !== undefined;
  if (!hasMonthly && !hasQuarterly) {
    ctx.addIssue({
      code: 'custom',
      message: 'At least one of priceMonthly or priceQuarterly is required',
      path: ['priceMonthly'],
    });
  }
};

export const createCourseSchema = z
  .object({
    title: z.string().min(3).trim(),
    description: z.string().min(10).trim(),
    priceMonthly: gbpPrice.optional(),
    priceQuarterly: gbpPrice.optional(),
    isPublished: z.boolean().optional(),
    // Google Drive folder ID — admin copies this from the Drive folder URL
    // e.g. https://drive.google.com/drive/folders/<THIS_PART>
    driveFolderId: z.string().min(10, 'Invalid Drive folder ID').optional(),
  })
  .superRefine(coursePricingRefine);

export const updateCourseSchema = z
  .object({
    title: z.string().min(3).trim().optional(),
    description: z.string().min(10).trim().optional(),
    priceMonthly: gbpPrice.optional(),
    priceQuarterly: gbpPrice.optional(),
    isPublished: z.boolean().optional(),
    driveFolderId: z.string().min(10, 'Invalid Drive folder ID').optional(),
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
