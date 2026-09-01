import { Types } from 'mongoose';
import { AppError } from '../../../shared/utils/appError';
import { Activity } from '../model/activities.model';
import { CreateActivityInput, UpdateActivityInput } from '../schema/activities.schema';

export const createActivity = async (input: CreateActivityInput, createdBy: Types.ObjectId) => {
  return Activity.create({
    date: input.date,
    description: input.description,
    createdBy,
  });
};

export const getAllActivities = async (page = 1, limit = 20) => {
  const [items, total] = await Promise.all([
    Activity.find()
      .sort({ date: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Activity.countDocuments(),
  ]);
  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
};

export const updateActivity = async (activityId: string, input: UpdateActivityInput) => {
  const activity = await Activity.findById(activityId);
  if (!activity) throw new AppError('Activity not found', 404);

  Object.assign(activity, input);
  await activity.save();

  return activity;
};

export const deleteActivity = async (activityId: string): Promise<void> => {
  const activity = await Activity.findByIdAndDelete(activityId);
  if (!activity) throw new AppError('Activity not found', 404);
};
