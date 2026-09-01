import { AppError } from '../../../shared/utils/appError';
import { Feedback } from '../model/feedback.model';
import { CreateFeedbackInput } from '../schema/feedback.schema';

export const submitFeedback = async (input: CreateFeedbackInput) => {
  return Feedback.create(input);
};

export const getAllFeedback = async (page = 1, limit = 20) => {
  const [items, total] = await Promise.all([
    Feedback.find()
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Feedback.countDocuments(),
  ]);
  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
};

export const deleteFeedback = async (feedbackId: string): Promise<void> => {
  const feedback = await Feedback.findByIdAndDelete(feedbackId);
  if (!feedback) throw new AppError('Feedback not found', 404);
};
