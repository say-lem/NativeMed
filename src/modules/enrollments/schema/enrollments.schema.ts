import { z } from 'zod';

const mongoId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid ID');

// ── Admin: revoke a user's course access ──────────────────────────────────────
export const revokeEnrollmentSchema = z.object({
  userId:   mongoId,
  courseId: mongoId,
});

// ── Admin: manually enroll a user (comped / gifted access, no payment needed) ─
export const manualEnrollSchema = z.object({
  userId:     mongoId,
  courseId:   mongoId,
  accessTier: z.enum(['mocksessions_only', 'mocksession_and_lectures']).default('mocksession_and_lectures'),
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