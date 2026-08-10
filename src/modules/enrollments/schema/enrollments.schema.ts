import { z } from 'zod';

const mongoId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid ID');

// ── Admin: revoke a user's course access ──────────────────────────────────────
export const revokeEnrollmentSchema = z.object({
  userId:   mongoId,
  courseId: mongoId,
});

// ── Admin: manually grant access (comped / gifted, no payment needed) ─────────
// Same endpoint covers both course enrollment and Case Bank — "type" picks
// which. Defaults to "course" so any existing caller that doesn't send it
// keeps working unchanged.
export const manualEnrollSchema = z
  .object({
    userId:       mongoId,
    type:         z.enum(['case_bank', 'course']).default('course'),
    courseId:     mongoId.optional(),
    accessTier:   z.enum(['mocksessions_only', 'mocksession_and_lectures']).optional(),
    // Case Bank only — how many days of access to grant. Defaults to 30 (one billing month).
    durationDays: z.coerce.number().int().min(1).max(3650).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type === 'course' && !data.courseId) {
      ctx.addIssue({
        code: 'custom',
        message: 'courseId is required when type is "course"',
        path: ['courseId'],
      });
    }
  });

// ── Admin: restore a previously revoked enrollment ───────────────────────────
export const restoreEnrollmentSchema = z.object({
  enrollmentId: mongoId,
});

// ── Query filters for paginated lists ────────────────────────────────────────
export const enrollmentQuerySchema = z.object({
  page:  z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type RevokeEnrollmentInput   = z.infer<typeof revokeEnrollmentSchema>;
export type ManualEnrollInput       = z.infer<typeof manualEnrollSchema>;
export type RestoreEnrollmentInput  = z.infer<typeof restoreEnrollmentSchema>;
export type EnrollmentQueryInput    = z.infer<typeof enrollmentQuerySchema>;