import { Router } from 'express';
import { validate } from '../../../shared/middleware/validate';
import { createReviewSchema } from '../schema/reviews.schema';
import { createFeedbackSchema } from '../schema/feedback.schema';
import * as reviewsController from '../controller/reviews.controller';
import * as feedbackController from '../controller/feedback.controller';

const router = Router();

// Open endpoint — anyone can drop a review, no auth. Goes in as "pending".
router.post('/', validate(createReviewSchema), reviewsController.submitReview);

// Open endpoint — only approved reviews are ever returned here.
router.get('/', reviewsController.getApprovedReviews);

// Open endpoint — private feedback straight to the admin inbox. Unlike a
// review, this is never shown publicly and needs no approval.
router.post('/feedback', validate(createFeedbackSchema), feedbackController.submitFeedback);

export default router;
