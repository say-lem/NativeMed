import { Router } from 'express';
import { authenticate } from '../../../shared/middleware/authenticate';
import { authorize } from '../../../shared/middleware/authorize';
import { validate } from '../../../shared/middleware/validate';
import { updateReviewSchema } from '../schema/reviews.schema';
import * as reviewsController from '../controller/reviews.controller';
import * as feedbackController from '../controller/feedback.controller';

const router = Router();
router.use(authenticate, authorize('admin'));

// All reviews, optionally filtered by ?status=pending|approved|revoked
router.get('/', reviewsController.getAllReviews);

// Private feedback inbox — only ever visible to admins
router.get('/feedback', feedbackController.getAllFeedback);
router.delete('/feedback/:feedbackId', feedbackController.deleteFeedback);

// Edit a review's content — only while it's still pending
router.patch('/:reviewId', validate(updateReviewSchema), reviewsController.updateReview);

// Approve a pending (or previously revoked) review so it becomes publicly visible
router.patch('/:reviewId/approve', reviewsController.approveReview);

// Revoke a previously approved review — pulls it from the public feed
router.patch('/:reviewId/revoke', reviewsController.revokeReview);

// Permanently delete a review
router.delete('/:reviewId', reviewsController.deleteReview);

export default router;
