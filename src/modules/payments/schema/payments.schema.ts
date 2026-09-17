import { z } from 'zod';

const mongoId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid ID');

export const createCheckoutSchema = z
  .object({
    type:       z.enum(['case_bank', 'course']),
    interval:   z.enum(['monthly', 'quarterly']),
    courseId:   mongoId.optional(),
    successUrl: z.string().url().optional(),
    cancelUrl:  z.string().url().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type === 'course' && !data.courseId) {
      ctx.addIssue({ code: 'custom', message: 'courseId is required for course subscriptions', path: ['courseId'] });
    }
    if (data.type === 'case_bank') {
      if (data.interval !== 'monthly') {
        ctx.addIssue({ code: 'custom', message: 'Case Bank is billed monthly only', path: ['interval'] });
      }
    }
  });

export const billingPortalSchema = z.object({
  returnUrl: z.string().url().optional(),
});

export const paymentHistoryQuerySchema = z.object({
  page:  z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateCheckoutInput = z.infer<typeof createCheckoutSchema>;
export type BillingPortalInput  = z.infer<typeof billingPortalSchema>;
