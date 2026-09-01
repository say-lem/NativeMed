import { Types } from 'mongoose';
import * as reviewsService from './reviews.service';
import { Review } from '../model/reviews.model';

const validInput = { name: 'Ada Lovelace', rating: 5, review: 'Absolutely fantastic course material.' };

describe('reviews.service', () => {
  describe('createReview', () => {
    it('creates a review in pending status', async () => {
      const review = await reviewsService.createReview(validInput);
      expect(review.status).toBe('pending');
      expect(review.name).toBe(validInput.name);
      expect(review.rating).toBe(5);
    });
  });

  describe('getApprovedReviews', () => {
    it('only returns approved reviews', async () => {
      await Review.create({ ...validInput, status: 'pending' });
      const approved = await Review.create({ ...validInput, name: 'Approved One', status: 'approved' });
      await Review.create({ ...validInput, name: 'Revoked One', status: 'revoked' });

      const result = await reviewsService.getApprovedReviews(1, 20);

      expect(result.total).toBe(1);
      expect(result.items).toHaveLength(1);
      expect(result.items[0]._id.toString()).toBe(approved._id.toString());
    });

    it('paginates results', async () => {
      for (let i = 0; i < 3; i++) {
        await Review.create({ ...validInput, name: `Reviewer ${i}`, status: 'approved' });
      }

      const page1 = await reviewsService.getApprovedReviews(1, 2);
      const page2 = await reviewsService.getApprovedReviews(2, 2);

      expect(page1.items).toHaveLength(2);
      expect(page2.items).toHaveLength(1);
      expect(page1.totalPages).toBe(2);
    });
  });

  describe('getAllReviews (admin)', () => {
    it('returns every review when no status filter is given', async () => {
      await Review.create({ ...validInput, status: 'pending' });
      await Review.create({ ...validInput, status: 'approved' });

      const result = await reviewsService.getAllReviews(undefined, 1, 20);
      expect(result.total).toBe(2);
    });

    it('filters by status', async () => {
      await Review.create({ ...validInput, status: 'pending' });
      await Review.create({ ...validInput, status: 'approved' });

      const result = await reviewsService.getAllReviews('approved', 1, 20);
      expect(result.total).toBe(1);
      expect(result.items[0].status).toBe('approved');
    });
  });

  describe('updateReview', () => {
    it('edits a pending review', async () => {
      const review = await Review.create({ ...validInput, status: 'pending' });

      const updated = await reviewsService.updateReview(review._id.toString(), { rating: 3 });

      expect(updated.rating).toBe(3);
    });

    it('rejects editing an approved review', async () => {
      const review = await Review.create({ ...validInput, status: 'approved' });

      await expect(
        reviewsService.updateReview(review._id.toString(), { rating: 1 }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('throws 404 for a missing review', async () => {
      await expect(
        reviewsService.updateReview(new Types.ObjectId().toString(), { rating: 1 }),
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('approveReview', () => {
    it('approves a pending review and stamps the moderator', async () => {
      const review = await Review.create({ ...validInput, status: 'pending' });
      const adminId = new Types.ObjectId();

      const approved = await reviewsService.approveReview(review._id.toString(), adminId);

      expect(approved.status).toBe('approved');
      expect(approved.moderatedBy?.toString()).toBe(adminId.toString());
      expect(approved.moderatedAt).toBeInstanceOf(Date);
    });

    it('rejects approving an already-approved review', async () => {
      const review = await Review.create({ ...validInput, status: 'approved' });

      await expect(
        reviewsService.approveReview(review._id.toString(), new Types.ObjectId()),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('allows re-approving a revoked review', async () => {
      const review = await Review.create({ ...validInput, status: 'revoked' });

      const approved = await reviewsService.approveReview(review._id.toString(), new Types.ObjectId());
      expect(approved.status).toBe('approved');
    });
  });

  describe('revokeReview', () => {
    it('revokes an approved review', async () => {
      const review = await Review.create({ ...validInput, status: 'approved' });

      const revoked = await reviewsService.revokeReview(review._id.toString(), new Types.ObjectId());
      expect(revoked.status).toBe('revoked');
    });

    it('rejects revoking a review that is not approved', async () => {
      const review = await Review.create({ ...validInput, status: 'pending' });

      await expect(
        reviewsService.revokeReview(review._id.toString(), new Types.ObjectId()),
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe('deleteReview', () => {
    it('permanently deletes a review regardless of status', async () => {
      const review = await Review.create({ ...validInput, status: 'approved' });

      await reviewsService.deleteReview(review._id.toString());

      expect(await Review.findById(review._id)).toBeNull();
    });

    it('throws 404 for a missing review', async () => {
      await expect(
        reviewsService.deleteReview(new Types.ObjectId().toString()),
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });
});
