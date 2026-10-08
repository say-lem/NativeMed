import { Types } from 'mongoose';
import { AppError } from '../../../shared/utils/appError';
import { Course } from '../../courses/model/courses.model';
import { LiveCourse } from '../../liveCourses/model/liveCourses.model';
import { BookingProduct } from '../../booking/model/booking.model';
import { FreeProduct } from '../../freeProducts/model/freeProducts.model';
import { Activity } from '../model/activities.model';
import { CreateActivityInput, UpdateActivityInput } from '../schema/activities.schema';

export const createActivity = async (input: CreateActivityInput, createdBy: Types.ObjectId) => {
  const attachment = await resolveAttachment(input);
  return new Activity({
    ...input,
    ...attachment,
    createdBy,
  }).save();
};

// Keep old clients working while storing one canonical product attachment.
const resolveAttachment = async (input: UpdateActivityInput) => {
  if (input.product !== undefined && input.courseId !== undefined) {
    throw new AppError('Provide product or courseId, not both', 400);
  }
  const product = input.product !== undefined ? input.product
    : input.courseId !== undefined ? (input.courseId ? { type: 'course' as const, id: input.courseId } : null)
    : undefined;
  if (product === undefined) return {};
  if (product && product.type !== 'case_bank') {
    const exists = product.type === 'course' ? await Course.exists({ _id: product.id })
      : product.type === 'live_course' ? await LiveCourse.exists({ _id: product.id })
      : product.type === 'one_on_one' ? await BookingProduct.exists({ _id: product.id })
      : await FreeProduct.exists({ _id: product.id });
    if (!exists) throw new AppError('Product not found', 404);
  }
  return { product, courseId: product?.type === 'course' ? product.id : null };
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

  const attachment = await resolveAttachment(input);
  Object.assign(activity, input, attachment);
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
