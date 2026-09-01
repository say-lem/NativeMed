import { Types } from 'mongoose';
import { AppError } from '../../../shared/utils/appError';
import { Review, ReviewStatus } from '../model/reviews.model';
import { CreateReviewInput, UpdateReviewInput } from '../schema/reviews.schema';

// ─────────────────────────────────────────────────────────────────────────────
// Public — submit + read approved reviews
// ─────────────────────────────────────────────────────────────────────────────

export const createReview = async (input: CreateReviewInput) => {
  return Review.create({
    name: input.name,
    rating: input.rating,
    review: input.review,
    status: 'pending',
  });
};

export const getApprovedReviews = async (page = 1, limit = 20) => {
  const [items, total] = await Promise.all([
    Review.find({ status: 'approved' })
      .select('name rating review createdAt')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Review.countDocuments({ status: 'approved' }),
  ]);
  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
};

// ─────────────────────────────────────────────────────────────────────────────
// Admin — moderation queue
// ─────────────────────────────────────────────────────────────────────────────

export const getAllReviews = async (status?: ReviewStatus, page = 1, limit = 20) => {
  const filter = status ? { status } : {};
  const [items, total] = await Promise.all([
    Review.find(filter)
      .populate('moderatedBy', 'fullName email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Review.countDocuments(filter),
  ]);
  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
};

// Edit is only allowed pre-approval — once a review is live/revoked, content
// should be immutable and go through revoke/delete instead.
export const updateReview = async (reviewId: string, input: UpdateReviewInput) => {
  const review = await Review.findById(reviewId);
  if (!review) throw new AppError('Review not found', 404);
  if (review.status !== 'pending') {
    throw new AppError('Only pending reviews can be edited', 400);
  }

  Object.assign(review, input);
  await review.save();

  return review;
};

export const approveReview = async (reviewId: string, adminId: Types.ObjectId) => {
  const review = await Review.findById(reviewId);
  if (!review) throw new AppError('Review not found', 404);
  if (review.status === 'approved') throw new AppError('Review is already approved', 400);

  review.status = 'approved';
  review.moderatedBy = adminId;
  review.moderatedAt = new Date();
  await review.save();

  return review;
};

export const revokeReview = async (reviewId: string, adminId: Types.ObjectId) => {
  const review = await Review.findById(reviewId);
  if (!review) throw new AppError('Review not found', 404);
  if (review.status !== 'approved') throw new AppError('Only approved reviews can be revoked', 400);

  review.status = 'revoked';
  review.moderatedBy = adminId;
  review.moderatedAt = new Date();
  await review.save();

  return review;
};

export const deleteReview = async (reviewId: string): Promise<void> => {
  const review = await Review.findByIdAndDelete(reviewId);
  if (!review) throw new AppError('Review not found', 404);
};
