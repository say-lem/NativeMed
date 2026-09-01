import { Schema, model, Document, Types } from 'mongoose';

export interface IActivity extends Document {
  _id: Types.ObjectId;
  date: Date;
  description: string;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const activitySchema = new Schema<IActivity>(
  {
    date:        { type: Date, required: true },
    description: { type: String, required: true, trim: true, maxlength: 2000 },
    createdBy:   { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

// Public feed, most recent activity first
activitySchema.index({ date: -1 });

export const Activity = model<IActivity>('Activity', activitySchema);
