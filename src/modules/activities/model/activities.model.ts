import type { z } from 'zod';
import type { activityProductSchema } from '../schema/activities.schema';
import { Schema, model, Document, Types } from 'mongoose';

export interface IActivity extends Document {
  _id: Types.ObjectId;
  date: Date;
  description: string;
  time?: string;
  activityType?: string;
  activityStatus?: string;
  product?: (Omit<z.infer<typeof activityProductSchema>, 'id'> & { id?: Types.ObjectId }) | null;
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
    product: {
      type: new Schema({
        type: { type: String, enum: ['course', 'live_course', 'one_on_one', 'free_product', 'case_bank'], required: true },
        id: { type: Schema.Types.ObjectId },
      }, { _id: false }),
      default: undefined,
    },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course' },
    isPublished: { type: Boolean, default: true },
    createdBy:   { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

// Expose existing course links through the new attachment field without a migration.
activitySchema.set('toJSON', {
  transform: (_doc, ret) => {
    if (ret.product === undefined && ret.courseId) {
      ret.product = { type: 'course', id: ret.courseId };
    }
    return ret;
  },
});

// Public feed, most recent activity first
activitySchema.index({ date: -1 });

export const Activity = model<IActivity>('Activity', activitySchema);
