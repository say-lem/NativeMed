import { Types } from 'mongoose';
import { AppError } from '../../../shared/utils/appError';
import { Course } from '../../courses/model/courses.model';
import { Activity } from '../model/activities.model';
import { CreateActivityInput, UpdateActivityInput } from '../schema/activities.schema';

export const createActivity = async (input: CreateActivityInput, createdBy: Types.ObjectId) => {
  await validateCourse(input.courseId);
  return Activity.create({
    ...input,
    createdBy,
  });
};

const validateCourse = async (courseId?: string | null) => {
  if (courseId && !await Course.exists({ _id: courseId })) {
    throw new AppError('Course not found', 404);
  }
};

export const getAllActivities = async (page = 1, limit = 20, includeUnpublished = false) => {
  // Existing announcements without the field remain public.
  const filter = includeUnpublished ? {} : { isPublished: { $ne: false } };
  const [items, total] = await Promise.all([
    Activity.find(filter)
      .sort({ date: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Activity.countDocuments(filter),
  ]);
  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
};

export const updateActivity = async (activityId: string, input: UpdateActivityInput) => {
  const activity = await Activity.findById(activityId);
  if (!activity) throw new AppError('Activity not found', 404);

  await validateCourse(input.courseId);
  Object.assign(activity, input);
  await activity.save();

  return activity;
};

export const deleteActivity = async (activityId: string): Promise<void> => {
  const activity = await Activity.findByIdAndDelete(activityId);
  if (!activity) throw new AppError('Activity not found', 404);
};

export const setActivityPublished = async (activityId: string, isPublished: boolean) => {
  return updateActivity(activityId, { isPublished });
};
