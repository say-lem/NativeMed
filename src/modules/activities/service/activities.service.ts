import { Types } from 'mongoose';
import { Activity } from '../model/activities.model';
import { CreateActivityInput } from '../schema/activities.schema';

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
