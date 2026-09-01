import { Schema, model, Document, Types } from 'mongoose';

// Distinct from Review — this is a private admin inbox, never approved or
// published, so it carries none of the moderation/rating fields.
export interface IFeedback extends Document {
  _id: Types.ObjectId;
  name?: string;
  message: string;
  createdAt: Date;
  updatedAt: Date;
}

const feedbackSchema = new Schema<IFeedback>(
  {
    name:    { type: String, trim: true, maxlength: 100 },
    message: { type: String, required: true, trim: true, maxlength: 2000 },
  },
  { timestamps: true },
);

// Admin inbox, newest first
feedbackSchema.index({ createdAt: -1 });

export const Feedback = model<IFeedback>('Feedback', feedbackSchema);
