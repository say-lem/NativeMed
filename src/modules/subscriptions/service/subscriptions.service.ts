import { Types } from 'mongoose';
import Stripe from 'stripe';
import { AppError } from '../../../shared/utils/appError';
import {
  BillingInterval,
  CourseAccessTier,
  SubscriptionStatus,
  SubscriptionType,
} from '../../../shared/types';
import { Subscription, ISubscription } from '../model/subscriptions.model';
import { ALL_PLANS } from '../constants/plans';
import {
  getSubscriptionPeriod,
  mapStripeSubscriptionStatus,
} from '../../payments/utils/stripe.helpers';

const ACTIVE_STATUSES: SubscriptionStatus[] = ['active', 'past_due'];

// ─────────────────────────────────────────────────────────────────────────────
// Access checks
// ─────────────────────────────────────────────────────────────────────────────

export const hasCaseBankAccess = async (userId: Types.ObjectId): Promise<boolean> => {
  const sub = await Subscription.findOne({
    userId,
    type: 'case_bank',
    status: { $in: ACTIVE_STATUSES },
    currentPeriodEnd: { $gt: new Date() },
  });
  return !!sub;
};

export const getActiveCourseSubscription = async (
  userId: Types.ObjectId,
  courseId: string,
): Promise<ISubscription | null> => {
  return Subscription.findOne({
    userId,
    type: 'course',
    courseId,
    status: { $in: ACTIVE_STATUSES },
    currentPeriodEnd: { $gt: new Date() },
  });
};

export const getCourseAccessTier = async (
  userId: Types.ObjectId,
  courseId: string,
): Promise<CourseAccessTier | null> => {
  const sub = await getActiveCourseSubscription(userId, courseId);
  return sub?.tier ?? null;
};

export const hasCourseAccess = async (
  userId: Types.ObjectId,
  courseId: string,
): Promise<boolean> => {
  const sub = await getActiveCourseSubscription(userId, courseId);
  return !!sub;
};

// ─────────────────────────────────────────────────────────────────────────────
// Reads
// ─────────────────────────────────────────────────────────────────────────────

export const getAvailablePlans = () => ALL_PLANS;

export const getMySubscriptions = async (userId: Types.ObjectId) => {
  return Subscription.find({ userId })
    .populate('courseId', 'title thumbnailUrl')
    .sort({ createdAt: -1 });
};

const formatSubscriptionPlan = (
  type: SubscriptionType,
  billingInterval: BillingInterval,
  tier?: CourseAccessTier,
): string => {
  if (type === 'case_bank') {
    return `Case Bank (${billingInterval})`;
  }

  const tierLabel = tier === 'pdf_drive' ? 'PDF + Drive' : 'PDF Only';
  return `Course ${tierLabel} (${billingInterval})`;
};

export interface SubscriberListItem {
  name: string;
  email: string;
  subscriptionPlan: string;
  subscribedTo: string;
  expiryDate: Date;
  status: 'active' | 'expired';
}

export const getAllSubscribers = async (): Promise<SubscriberListItem[]> => {
  const subscriptions = await Subscription.find()
    .populate('userId', 'fullName email')
    .populate('courseId', 'title')
    .sort({ createdAt: -1 })
    .lean();

  const now = new Date();

  return subscriptions.map((subscription) => {
    const user = subscription.userId as unknown as { fullName?: string; email?: string };
    const course = subscription.courseId as unknown as { title?: string };
    const isActive = subscription.currentPeriodEnd > now;

    return {
      name: user?.fullName ?? 'Unknown User',
      email: user?.email ?? '',
      subscriptionPlan: formatSubscriptionPlan(
        subscription.type,
        subscription.billingInterval,
        subscription.tier,
      ),
      subscribedTo:
        subscription.type === 'case_bank'
          ? 'Case Bank'
          : (course?.title ?? 'Course'),
      expiryDate: subscription.currentPeriodEnd,
      status: isActive ? 'active' : 'expired',
    };
  });
};

export const getCaseBankStatus = async (userId: Types.ObjectId) => {
  const sub = await Subscription.findOne({
    userId,
    type: 'case_bank',
    status: { $in: ACTIVE_STATUSES },
    currentPeriodEnd: { $gt: new Date() },
  });

  if (!sub) return { active: false as const };

  return {
    active: true as const,
    currentPeriodEnd: sub.currentPeriodEnd,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    billingInterval: sub.billingInterval,
  };
};

export const getCourseSubscriptionStatus = async (
  userId: Types.ObjectId,
  courseId: string,
) => {
  const sub = await getActiveCourseSubscription(userId, courseId);
  if (!sub) return { active: false as const };

  return {
    active: true as const,
    tier: sub.tier,
    currentPeriodEnd: sub.currentPeriodEnd,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    billingInterval: sub.billingInterval,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Stripe webhook helpers
// ─────────────────────────────────────────────────────────────────────────────

export interface UpsertSubscriptionInput {
  userId: Types.ObjectId;
  type: SubscriptionType;
  courseId?: Types.ObjectId;
  tier?: CourseAccessTier;
  billingInterval: BillingInterval;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  status: SubscriptionStatus;
  cancelAtPeriodEnd?: boolean;
}

export const upsertFromStripe = async (input: UpsertSubscriptionInput) => {
  const filter =
    input.type === 'case_bank'
      ? { userId: input.userId, type: 'case_bank' as const }
      : { userId: input.userId, type: 'course' as const, courseId: input.courseId };

  return Subscription.findOneAndUpdate(
    filter,
    {
      ...input,
      cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
};

export const updateFromStripeSubscription = async (
  stripeSub: Stripe.Subscription,
): Promise<ISubscription | null> => {
  const status = mapStripeSubscriptionStatus(stripeSub.status);
  const period = getSubscriptionPeriod(stripeSub);

  return Subscription.findOneAndUpdate(
    { stripeSubscriptionId: stripeSub.id },
    {
      status,
      currentPeriodStart: period.currentPeriodStart,
      currentPeriodEnd: period.currentPeriodEnd,
      cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
    },
    { new: true },
  );
};

export const expireByStripeId = async (stripeSubscriptionId: string) => {
  return Subscription.findOneAndUpdate(
    { stripeSubscriptionId },
    { status: 'cancelled' },
    { new: true },
  );
};

export const getByStripeSubscriptionId = async (stripeSubscriptionId: string) => {
  return Subscription.findOne({ stripeSubscriptionId });
};

// ─────────────────────────────────────────────────────────────────────────────
// Admin
// ─────────────────────────────────────────────────────────────────────────────

export const countActiveSubscriptions = async (): Promise<number> => {
  return Subscription.countDocuments({
    status: { $in: ACTIVE_STATUSES },
    currentPeriodEnd: { $gt: new Date() },
  });
};

export const getUserCaseBankSubscription = async (userId: string) => {
  return Subscription.findOne({ userId, type: 'case_bank' }).sort({ createdAt: -1 });
};

export const assertNoConflictingSubscription = async (
  userId: Types.ObjectId,
  type: SubscriptionType,
  courseId?: string,
) => {
  if (type === 'case_bank') {
    const existing = await Subscription.findOne({
      userId,
      type: 'case_bank',
      status: { $in: ACTIVE_STATUSES },
      currentPeriodEnd: { $gt: new Date() },
    });
    if (existing) {
      throw new AppError('You already have an active Case Bank subscription', 409);
    }
    return;
  }

  if (!courseId) throw new AppError('courseId is required for course subscriptions', 400);

  const existing = await getActiveCourseSubscription(userId, courseId);
  if (existing) {
    throw new AppError('You already have an active subscription for this course', 409);
  }
};
