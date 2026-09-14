import { Router } from 'express';
import { authenticate } from '../../../shared/middleware/authenticate';
import { optionalAuthenticate } from '../../../shared/middleware/optionalAuthenticate';
import { authorize } from '../../../shared/middleware/authorize';
import { validate } from '../../../shared/middleware/validate';
import {
  createCaseSchema,
  updateCaseSchema,
  caseFilterSchema,
  caseIdSchema,
  caseSpecialtyParamsSchema,
} from '../schema/cases.schema';
import { updateCaseBankOverviewSchema } from '../schema/caseBankOverview.schema';
import * as casesController from '../controller/cases.controller';
import * as caseBankOverviewController from '../controller/caseBankOverview.controller';
import { uploadCaseImage, uploadCaseFiles } from '../upload/cases.upload';
import { parseCaseCreateMultipart } from '../middleware/parseCaseCreateMultipart';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// Public routes — the first FREE_CASE_PREVIEW_LIMIT cases are visible to
// anyone, logged in or not, as a sample. optionalAuthenticate lets a valid
// token unlock full access for subscribers/admins while never blocking an
// anonymous request.
// ─────────────────────────────────────────────────────────────────────────────

// Specialty filter options — used to populate filter dropdowns on the frontend
router.get('/specialties', optionalAuthenticate, casesController.getPublishedSpecialties);

// Paginated published case list with optional specialty/difficulty/search filters
router.get(
  '/',
  optionalAuthenticate,
  validate(caseFilterSchema, 'query'),
  casesController.getPublishedCases,
);

router.get(
  '/specialty/:specialty',
  optionalAuthenticate,
  validate(caseSpecialtyParamsSchema, 'params'),
  validate(caseFilterSchema, 'query'),
  casesController.getCasesBySpecialty,
);

// Case bank product overview (title/description/image) — static path, must
// come before /:id so "overview" is never captured as a case ID.
router.get('/overview', caseBankOverviewController.getCaseBankOverview);

// Full published case detail — all sections
router.get(
  '/:id',
  optionalAuthenticate,
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

// Case bank product overview — admin editor (static path before /admin/:id)
router.get(
  '/admin/overview',
  authenticate,
  authorize('admin'),
  caseBankOverviewController.getCaseBankOverview,
);
router.patch(
  '/admin/overview',
  authenticate,
  authorize('admin'),
  validate(updateCaseBankOverviewSchema),
  caseBankOverviewController.updateCaseBankOverview,
);
router.patch(
  '/admin/overview/image',
  authenticate,
  authorize('admin'),
  uploadCaseImage.single('image'),
  caseBankOverviewController.updateCaseBankOverviewImage,
);

// Admin full detail view — drafts included
router.get(
  '/admin/:id',
  authenticate,
  authorize('admin'),
  validate(caseIdSchema, 'params'),
  casesController.getCaseByIdAdmin,
);

// Create a new case (always starts as a draft unless isPublished: true is set).
// JSON body, or multipart with `payload` (JSON string) + optional `image` / `stationImage` files.
router.post(
  '/',
  authenticate,
  authorize('admin'),
  uploadCaseFiles.fields([{ name: 'image', maxCount: 1 }, { name: 'stationImage', maxCount: 1 }]),
  parseCaseCreateMultipart,
  validate(createCaseSchema),
  casesController.createCase,
);

// Upload or replace the optional case cover image
router.patch(
  '/:id/image',
  authenticate,
  authorize('admin'),
  validate(caseIdSchema, 'params'),
  uploadCaseImage.single('image'),
  casesController.uploadCaseImage,
);

// Upload or replace the optional station image
router.patch(
  '/:id/station-image',
  authenticate,
  authorize('admin'),
  validate(caseIdSchema, 'params'),
  uploadCaseImage.single('stationImage'),
  casesController.uploadCaseStationImage,
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