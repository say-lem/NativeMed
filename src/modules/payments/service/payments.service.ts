import { Types } from 'mongoose';
import Stripe from 'stripe';
import { env } from '../../../config/env';
import { stripe } from '../../../config/stripe';
import { AppError } from '../../../shared/utils/appError';
import {
  BillingInterval,
  CourseAccessTier,
  SubscriptionType,
} from '../../../shared/types';
import { User } from '../../auth/model/auth.model';
import { Course } from '../../courses/model/courses.model';
import { Payment } from '../model/payments.model';
import { ISubscription } from '../../subscriptions/model/subscriptions.model';
import { resolvePlanPrice } from '../../subscriptions/constants/plans';
import * as subscriptionsService from '../../subscriptions/service/subscriptions.service';
import * as enrollmentsService from '../../enrollments/service/enrollments.service';
import {
  getInvoicePaymentIntentId,
  getInvoiceSubscriptionId,
  getSubscriptionPeriod,
  mapStripeSubscriptionStatus,
} from '../utils/stripe.helpers';

export interface CreateCheckoutInput {
  userId: Types.ObjectId;
  email: string;
  type: SubscriptionType;
  tier?: CourseAccessTier;
  interval: BillingInterval;
  courseId?: string;
  successUrl?: string;
  cancelUrl?: string;
}

export const createCheckoutSession = async (input: CreateCheckoutInput) => {
  const { userId, type, tier, interval, courseId } = input;

  await subscriptionsService.assertNoConflictingSubscription(userId, type, courseId);

  if (type === 'course') {
    if (!courseId) throw new AppError('courseId is required for course subscriptions', 400);
    if (!tier) throw new AppError('tier is required for course subscriptions', 400);

    const course = await Course.findById(courseId);
    if (!course) throw new AppError('Course not found', 404);
    if (!course.isPublished) throw new AppError('This course is not available for purchase', 400);
  }

  const planPrice = resolvePlanPrice(type, interval, tier);

  const successUrl = input.successUrl ?? `${env.CLIENT_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = input.cancelUrl ?? `${env.CLIENT_URL}/payment/cancelled`;

  const metadata: Record<string, string> = {
    userId: userId.toString(),
    type,
    interval,
  };
  if (courseId) metadata.courseId = courseId;
  if (tier) metadata.tier = tier;

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer_email: input.email,
    line_items: [{ price: planPrice.stripePriceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata,
    subscription_data: { metadata },
  });

  return {
    sessionId: session.id,
    url: session.url,
  };
};

export const handleWebhookEvent = async (event: Stripe.Event) => {
  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
      break;
    case 'invoice.payment_succeeded':
      await handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
      break;
    case 'invoice.payment_failed':
      await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
      break;
    case 'customer.subscription.updated':
      await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
      break;
    case 'customer.subscription.deleted':
      await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
      break;
    default:
      break;
  }
};

export const constructWebhookEvent = (payload: Buffer, signature: string) => {
  return stripe.webhooks.constructEvent(payload, signature, env.STRIPE_WEBHOOK_SECRET);
};

export const getMyPayments = async (userId: Types.ObjectId, page = 1, limit = 20) => {
  const [items, total] = await Promise.all([
    Payment.find({ userId })
      .populate('courseId', 'title')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Payment.countDocuments({ userId }),
  ]);
  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
};

export const getTotalRevenue = async (): Promise<number> => {
  const result = await Payment.aggregate<{ total: number }>([
    { $match: { status: 'succeeded' } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  return result[0]?.total ?? 0;
};

export const getRecentPayments = async (limit = 10) => {
  return Payment.find({ status: 'succeeded' })
    .populate('userId', 'fullName email')
    .populate('courseId', 'title')
    .sort({ paidAt: -1 })
    .limit(limit);
};

// ─────────────────────────────────────────────────────────────────────────────
// Webhook handlers
// ─────────────────────────────────────────────────────────────────────────────

const handleCheckoutCompleted = async (session: Stripe.Checkout.Session) => {
  if (session.mode !== 'subscription' || !session.subscription) return;

  const stripeSub = await stripe.subscriptions.retrieve(session.subscription as string);
  await syncSubscriptionFromStripe(stripeSub, session.metadata ?? undefined);

  if (session.amount_total != null) {
    await recordPaymentFromSession(session, stripeSub, 'succeeded');
  }
};

const handleInvoicePaymentSucceeded = async (invoice: Stripe.Invoice) => {
  const subscriptionId = getInvoiceSubscriptionId(invoice);
  if (!subscriptionId) return;

  const stripeSub = await stripe.subscriptions.retrieve(subscriptionId);
  const subscription = await syncSubscriptionFromStripe(stripeSub);

  if (!subscription) return;

  await Payment.findOneAndUpdate(
    { stripeInvoiceId: invoice.id },
    {
      userId: subscription.userId,
      subscriptionId: subscription._id,
      amount: invoice.amount_paid,
      currency: invoice.currency,
      status: 'succeeded',
      method: 'stripe',
      itemType: subscription.type,
      courseId: subscription.courseId,
      tier: subscription.tier,
      billingInterval: subscription.billingInterval,
      stripeInvoiceId: invoice.id,
      stripePaymentIntentId: getInvoicePaymentIntentId(invoice),
      paidAt: new Date(),
    },
    { upsert: true, new: true },
  );

  await grantAccessForSubscription(subscription);
};

const handleInvoicePaymentFailed = async (invoice: Stripe.Invoice) => {
  const subscriptionId = getInvoiceSubscriptionId(invoice);
  if (!subscriptionId) return;

  const subscription = await subscriptionsService.getByStripeSubscriptionId(subscriptionId);
  if (!subscription) return;

  await Payment.findOneAndUpdate(
    { stripeInvoiceId: invoice.id },
    {
      userId: subscription.userId,
      subscriptionId: subscription._id,
      amount: invoice.amount_due,
      currency: invoice.currency,
      status: 'failed',
      method: 'stripe',
      itemType: subscription.type,
      courseId: subscription.courseId,
      tier: subscription.tier,
      billingInterval: subscription.billingInterval,
      stripeInvoiceId: invoice.id,
    },
    { upsert: true, new: true },
  );
};

const handleSubscriptionUpdated = async (stripeSub: Stripe.Subscription) => {
  const subscription = await subscriptionsService.updateFromStripeSubscription(stripeSub);
  if (!subscription) return;

  if (subscription.status === 'active' || subscription.status === 'past_due') {
    await grantAccessForSubscription(subscription);
  } else {
    await revokeAccessForSubscription(subscription);
  }
};

const handleSubscriptionDeleted = async (stripeSub: Stripe.Subscription) => {
  const subscription = await subscriptionsService.expireByStripeId(stripeSub.id);
  if (subscription) await revokeAccessForSubscription(subscription);
};

const syncSubscriptionFromStripe = async (
  stripeSub: Stripe.Subscription,
  metadataOverride?: Stripe.Metadata,
) => {
  const metadata = { ...stripeSub.metadata, ...metadataOverride };
  const userId = metadata.userId;
  const type = metadata.type as SubscriptionType | undefined;
  const interval = metadata.interval as BillingInterval | undefined;

  if (!userId || !type || !interval) {
    console.error('❌  Stripe subscription missing metadata:', stripeSub.id);
    return null;
  }

  const tier = metadata.tier as CourseAccessTier | undefined;
  const courseId = metadata.courseId;
  const period = getSubscriptionPeriod(stripeSub);

  const subscription = await subscriptionsService.upsertFromStripe({
    userId: new Types.ObjectId(userId),
    type,
    courseId: courseId ? new Types.ObjectId(courseId) : undefined,
    tier,
    billingInterval: interval,
    stripeCustomerId:
      typeof stripeSub.customer === 'string' ? stripeSub.customer : stripeSub.customer.id,
    stripeSubscriptionId: stripeSub.id,
    currentPeriodStart: period.currentPeriodStart,
    currentPeriodEnd: period.currentPeriodEnd,
    status: mapStripeSubscriptionStatus(stripeSub.status),
    cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
  });

  await grantAccessForSubscription(subscription);
  return subscription;
};

const grantAccessForSubscription = async (subscription: ISubscription | null) => {
  if (!subscription) return;
  if (subscription.status !== 'active' && subscription.status !== 'past_due') return;

  if (subscription.type === 'course' && subscription.courseId && subscription.tier) {
    await enrollmentsService.createEnrollmentFromSubscription(
      subscription.userId as Types.ObjectId,
      subscription.courseId.toString(),
      subscription._id,
      subscription.tier,
    );
  }
};

const revokeAccessForSubscription = async (subscription: ISubscription | null) => {
  if (!subscription) return;

  if (subscription.type === 'course' && subscription.courseId) {
    await enrollmentsService.revokeEnrollment(
      subscription.userId.toString(),
      subscription.courseId.toString(),
    );
  }
};

const recordPaymentFromSession = async (
  session: Stripe.Checkout.Session,
  stripeSub: Stripe.Subscription,
  status: 'succeeded' | 'pending',
) => {
  const metadata = session.metadata ?? {};
  const userId = metadata.userId;
  if (!userId) return;

  const subscription = await subscriptionsService.getByStripeSubscriptionId(stripeSub.id);

  await Payment.findOneAndUpdate(
    { stripeCheckoutSessionId: session.id },
    {
      userId: new Types.ObjectId(userId),
      subscriptionId: subscription?._id,
      amount: session.amount_total ?? 0,
      currency: session.currency ?? 'gbp',
      status,
      method: 'stripe',
      itemType: (metadata.type as SubscriptionType) ?? 'case_bank',
      courseId: metadata.courseId ? new Types.ObjectId(metadata.courseId) : undefined,
      tier: metadata.tier as CourseAccessTier | undefined,
      billingInterval: metadata.interval as BillingInterval | undefined,
      stripeCheckoutSessionId: session.id,
      paidAt: status === 'succeeded' ? new Date() : undefined,
    },
    { upsert: true, new: true },
  );
};

export const createBillingPortalSession = async (userId: Types.ObjectId, returnUrl?: string) => {
  const sub = await subscriptionsService.getMySubscriptions(userId);
  const active = sub.find((s) => s.status === 'active' || s.status === 'past_due');
  if (!active?.stripeCustomerId) {
    throw new AppError('No active subscription found', 404);
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: active.stripeCustomerId,
    return_url: returnUrl ?? env.CLIENT_URL,
  });

  return { url: session.url };
};

export const getCheckoutUser = async (userId: Types.ObjectId) => {
  const user = await User.findById(userId).select('email fullName');
  if (!user) throw new AppError('User not found', 404);
  return user;
};
