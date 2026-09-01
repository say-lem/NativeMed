import * as feedbackService from './feedback.service';
import { Feedback } from '../model/feedback.model';
import { Types } from 'mongoose';

describe('feedback.service', () => {
  describe('submitFeedback', () => {
    it('creates a feedback entry', async () => {
      const feedback = await feedbackService.submitFeedback({
        name: 'Anon User',
        message: 'The mock sessions were incredibly helpful, thank you.',
      });

      expect(feedback.message).toContain('mock sessions');
      expect(await Feedback.countDocuments()).toBe(1);
    });

    it('allows submitting without a name', async () => {
      const feedback = await feedbackService.submitFeedback({
        message: 'Anonymous comment about the platform.',
      });

      expect(feedback.name).toBeUndefined();
    });
  });

  describe('getAllFeedback', () => {
    it('lists feedback newest first, paginated', async () => {
      await Feedback.create({ message: 'First message' });
      await Feedback.create({ message: 'Second message' });

      const result = await feedbackService.getAllFeedback(1, 20);

      expect(result.total).toBe(2);
      expect(result.items[0].message).toBe('Second message');
    });
  });

  describe('deleteFeedback', () => {
    it('deletes an existing entry', async () => {
      const feedback = await Feedback.create({ message: 'To be deleted' });

      await feedbackService.deleteFeedback(feedback._id.toString());

      expect(await Feedback.findById(feedback._id)).toBeNull();
    });

    it('throws 404 for a missing entry', async () => {
      await expect(
        feedbackService.deleteFeedback(new Types.ObjectId().toString()),
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });
});
