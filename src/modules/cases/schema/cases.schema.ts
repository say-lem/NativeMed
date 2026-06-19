import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Reusable primitives
// ─────────────────────────────────────────────────────────────────────────────

const mongoId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid ID');

const nonEmptyString = (label: string) =>
  z.string().trim().min(1, `${label} is required`);

// ─────────────────────────────────────────────────────────────────────────────
// Sub-document schemas
// ─────────────────────────────────────────────────────────────────────────────

const bloodTestRowSchema = z.object({
  test:           nonEmptyString('Test name'),
  result:         nonEmptyString('Result'),
  referenceRange: nonEmptyString('Reference range'),
  isAbnormal:     z.boolean().default(false),
});

const bloodTestResultsSchema = z.object({
  summary: nonEmptyString('Blood test summary'),
  rows:    z.array(bloodTestRowSchema).default([]),
});

const recentConsultationSchema = z.object({
  date:   z.coerce.date().optional(),
  seenBy: nonEmptyString('Seen by'),
  role:   z.string().trim().optional(),
  notes:  nonEmptyString('Consultation notes'),
});

const patientDataSchema = z.object({
  name:               nonEmptyString('Patient name'),
  age:                z.coerce.number().int().min(0).max(130),
  gender:             z.enum(['male', 'female', 'other']),
  pastMedicalHistory: z.array(z.string().trim()).default([]),
  drugHistory:        z.array(z.string().trim()).default([]),
  recentConsultation: recentConsultationSchema,
  bloodTestResults:   bloodTestResultsSchema,
});

const markingSchemeSectionSchema = z.object({
  heading: nonEmptyString('Section heading'),
  points:  z.array(z.string().trim().min(1)).min(1, 'At least one marking point required'),
});

const furtherResourceSchema = z.object({
  title: nonEmptyString('Resource title'),
  url:   z.string().url('Invalid URL'),
});

// ─────────────────────────────────────────────────────────────────────────────
// Create schema — all required sections must be present
// ─────────────────────────────────────────────────────────────────────────────

export const createCaseSchema = z.object({
  stationNumber:      z.coerce.number().int().min(1),
  title:              nonEmptyString('Title'),
  consultationType:   z.string().trim().default('Consultation'),
  specialty:          nonEmptyString('Specialty'),
  difficulty:         z.enum(['easy', 'medium', 'hard']).default('medium'),
  isPublished:        z.boolean().default(false),

  patientData:        patientDataSchema,

  patientStory:       nonEmptyString('Patient story'),
  markingScheme:      z.array(markingSchemeSectionSchema).min(1, 'At least one marking scheme section required'),
  exampleExplanation: nonEmptyString('Example explanation'),
  management:         z.array(z.string().trim().min(1)).min(1, 'At least one management point required'),
  learningPoints:     nonEmptyString('Learning points'),
  furtherResources:   z.array(furtherResourceSchema).default([]),
});

// ─────────────────────────────────────────────────────────────────────────────
// Update schema — every field is optional so admins can patch individual sections
// ─────────────────────────────────────────────────────────────────────────────

export const updateCaseSchema = createCaseSchema
  .partial()
  .extend({
    // Allow partial patientData — merge on save rather than full replace
    patientData: patientDataSchema.partial().optional(),
  });

// ─────────────────────────────────────────────────────────────────────────────
// Query / filter schema
// ─────────────────────────────────────────────────────────────────────────────

export const caseFilterSchema = z.object({
  specialty:  z.string().trim().optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
  search:     z.string().trim().optional(),
  page:       z.coerce.number().int().min(1).default(1),
  limit:      z.coerce.number().int().min(1).max(50).default(12),
});

export const caseIdSchema = z.object({
  id: mongoId,
});

export const caseSpecialtyParamsSchema = z.object({
  specialty: z.string().trim().min(1, 'Specialty is required'),
});

// ─────────────────────────────────────────────────────────────────────────────
// Inferred types
// ─────────────────────────────────────────────────────────────────────────────

export type CreateCaseInput  = z.infer<typeof createCaseSchema>;
export type UpdateCaseInput  = z.infer<typeof updateCaseSchema>;
export type CaseFilterInput  = z.infer<typeof caseFilterSchema>;

/** Optional cover image — set via upload endpoints, not the JSON create/update body */
export type CaseImageFields = {
  imageUrl?: string;
};