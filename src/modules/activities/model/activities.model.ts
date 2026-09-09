import { Schema, model, Document, Types } from 'mongoose';

export interface IActivity extends Document {
  _id: Types.ObjectId;
  date: Date;
  description: string;
  time?: string;
  activityType?: string;
  activityStatus?: string;
  courseId?: Types.ObjectId | null;
  isPublished: boolean;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const activitySchema = new Schema<IActivity>(
  {
    date:        { type: Date, required: true },
    description: { type: String, required: true, trim: true, maxlength: 2000 },
    time: { type: String, trim: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
    activityType: { type: String, trim: true, maxlength: 100 },
    activityStatus: { type: String, trim: true, maxlength: 100 },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course' },
    isPublished: { type: Boolean, default: true },
    createdBy:   { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

// Public feed, most recent activity first
activitySchema.index({ date: -1 });

export const Activity = model<IActivity>('Activity', activitySchema);
