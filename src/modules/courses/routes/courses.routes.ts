import { Router } from 'express';
import { authenticate } from '../../../shared/middleware/authenticate';
import { authorize } from '../../../shared/middleware/authorize';
import { validate } from '../../../shared/middleware/validate';
import {
  createCourseSchema,
  updateCourseSchema,
  courseFilterSchema,
  courseIdSchema,
} from '../schema/courses.schema';
import { uploadCourseThumbnail } from '../upload/courses.upload';
import * as coursesController from '../controller/courses.controller';

const router = Router();

// ── Public ────────────────────────────────────────────────────────────────────
router.get('/', coursesController.getAllPublished);

// ── Admin reads (before /:id so /admin/* is not captured as an id) ──────────
router.get(
  '/admin/all',
  authenticate,
  authorize('admin'),
  validate(courseFilterSchema, 'query'),
  coursesController.getAllCoursesAdmin,
);
router.get(
  '/admin/:id',
  authenticate,
  authorize('admin'),
  validate(courseIdSchema, 'params'),
  coursesController.getCourseByIdAdmin,
);

router.get('/:id', coursesController.getCourseById);

// ── Admin only ────────────────────────────────────────────────────────────────
router.post(
  '/',
  authenticate,
  authorize('admin'),
  validate(createCourseSchema),
  coursesController.createCourse,
);

router.patch(
  '/:id',
  authenticate,
  authorize('admin'),
  validate(updateCourseSchema),
  coursesController.updateCourse,
);

// Thumbnail is a separate endpoint from the main PATCH so it can use
// multer middleware without interfering with the JSON body parser used
// on the text-field update route above.
router.patch(
  '/:id/thumbnail',
  authenticate,
  authorize('admin'),
  uploadCourseThumbnail.single('thumbnail'),  // field name the client sends the file under
  coursesController.uploadThumbnail,
);

router.patch('/:id/publish', authenticate, authorize('admin'), coursesController.togglePublish);
router.delete('/:id', authenticate, authorize('admin'), coursesController.deleteCourse);

export default router;