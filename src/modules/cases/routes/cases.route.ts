import { Router } from 'express';
import { authenticate } from '../../../shared/middleware/authenticate';
import { authorize } from '../../../shared/middleware/authorize';
import { validate } from '../../../shared/middleware/validate';
import {
  createCaseSchema,
  updateCaseSchema,
  caseFilterSchema,
  caseIdSchema,
  caseSpecialtyParamsSchema,
} from '../schema/cases.schema';
import * as casesController from '../controller/cases.controller';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// Public / authenticated user routes
// Any logged-in user can browse published cases.
// ─────────────────────────────────────────────────────────────────────────────

// Specialty filter options — used to populate filter dropdowns on the frontend
router.get('/specialties', authenticate, casesController.getPublishedSpecialties);

// Paginated published case list with optional specialty/difficulty/search filters
router.get(
  '/',
  authenticate,
  validate(caseFilterSchema, 'query'),
  casesController.getPublishedCases,
);

router.get(
  '/specialty/:specialty',
  authenticate,
  validate(caseSpecialtyParamsSchema, 'params'),
  validate(caseFilterSchema, 'query'),
  casesController.getCasesBySpecialty,
);

// Full published case detail — all sections
router.get(
  '/:id',
  authenticate,
  validate(caseIdSchema, 'params'),
  casesController.getPublishedCaseById,
);

// ─────────────────────────────────────────────────────────────────────────────
// Admin-only routes
// ─────────────────────────────────────────────────────────────────────────────

// Admin case list — includes drafts, shows createdBy
router.get(
  '/admin/all',
  authenticate,
  authorize('admin'),
  validate(caseFilterSchema, 'query'),
  casesController.getAllCasesAdmin,
);

// Admin full detail view — drafts included
router.get(
  '/admin/:id',
  authenticate,
  authorize('admin'),
  validate(caseIdSchema, 'params'),
  casesController.getCaseByIdAdmin,
);

// Create a new case (always starts as a draft unless isPublished: true is set)
router.post(
  '/',
  authenticate,
  authorize('admin'),
  validate(createCaseSchema),
  casesController.createCase,
);

// Partial update — any combination of top-level or nested patientData fields
router.patch(
  '/:id',
  authenticate,
  authorize('admin'),
  validate(caseIdSchema, 'params'),
  validate(updateCaseSchema),
  casesController.updateCase,
);

// Toggle isPublished between true/false
router.patch(
  '/:id/publish',
  authenticate,
  authorize('admin'),
  validate(caseIdSchema, 'params'),
  casesController.togglePublish,
);

// Duplicate a case as a new draft with the next available station number
router.post(
  '/:id/duplicate',
  authenticate,
  authorize('admin'),
  validate(caseIdSchema, 'params'),
  casesController.duplicateCase,
);

// Hard delete — no soft-delete for now; add a recycle-bin flag later if needed
router.delete(
  '/:id',
  authenticate,
  authorize('admin'),
  validate(caseIdSchema, 'params'),
  casesController.deleteCase,
);

export default router;