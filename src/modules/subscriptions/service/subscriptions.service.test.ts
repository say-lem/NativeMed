jest.mock('../../../config/stripe', () => require('../../../../tests/mocks/stripe.mock'));

import { Types } from 'mongoose';
import type Stripe from 'stripe';
import * as subscriptionsService from './subscriptions.service';
import { Subscription } from '../model/subscriptions.model';
import { stripeMock } from '../../../../tests/mocks/stripe.mock';
import { createTestUser, createTestCourse, objectId } from '../../../../tests/helpers/factories';

const DAY = 24 * 60 * 60 * 1000;
const nowSeconds = () => Math.floor(Date.now() / 1000);

const fakeStripeSubscription = (overrides: Record<string, unknown> = {}): Stripe.Subscription =>
  ({
    id: 'sub_fake_123',
    customer: 'cus_fake_123',
    status: 'active',
    cancel_at_period_end: false,
    start_date: nowSeconds(),
    metadata: {},
    items: {
      data: [
        {
          current_period_start: nowSeconds(),
          current_period_end: nowSeconds() + 30 * 24 * 60 * 60,
        },
      ],
    },
    ...overrides,
  }) as unknown as Stripe.Subscription;

const createActiveCaseBankSub = (userId: Types.ObjectId, overrides: Record<string, unknown> = {}) =>
  Subscription.create({
    userId,
    type: 'case_bank',
    billingInterval: 'monthly',
    status: 'active',
    stripeCustomerId: 'cus_test',
    stripeSubscriptionId: `sub_test_${userId.toString()}`,
    currentPeriodStart: new Date(),
    currentPeriodEnd: new Date(Date.now() + 30 * DAY),
    ...overrides,
  });

const createActiveCourseSub = (
  userId: Types.ObjectId,
  courseId: Types.ObjectId,
  overrides: Record<string, unknown> = {},
) =>
  Subscription.create({
    userId,
    type: 'course',
    courseId,
    billingInterval: 'monthly',
    status: 'active',
    stripeCustomerId: 'cus_test',
    stripeSubscriptionId: `sub_course_${userId.toString()}`,
    currentPeriodStart: new Date(),
    currentPeriodEnd: new Date(Date.now() + 30 * DAY),
    ...overrides,
  });

describe('subscriptions.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('access checks', () => {
    it('hasCaseBankAccess is true only while active and unexpired', async () => {
      const userId = objectId();
      expect(await subscriptionsService.hasCaseBankAccess(userId)).toBe(false);

      await createActiveCaseBankSub(userId);
      expect(await subscriptionsService.hasCaseBankAccess(userId)).toBe(true);
    });

    it('hasCaseBankAccess is false once expired', async () => {
      const userId = objectId();
      await createActiveCaseBankSub(userId, { currentPeriodEnd: new Date(Date.now() - DAY) });
      expect(await subscriptionsService.hasCaseBankAccess(userId)).toBe(false);
    });

    it('hasCourseAccess reflects an active course subscription', async () => {
      const userId = objectId();
      const courseId = objectId();
      expect(await subscriptionsService.hasCourseAccess(userId, courseId.toString())).toBe(false);

      await createActiveCourseSub(userId, courseId);
      expect(await subscriptionsService.hasCourseAccess(userId, courseId.toString())).toBe(true);
    });
  });

  describe('reads', () => {
    it('getAvailablePlans includes the case bank plan', () => {
      const plans = subscriptionsService.getAvailablePlans();
      expect(plans.some((p) => p.type === 'case_bank')).toBe(true);
    });

    it('getMySubscriptions returns the user subscriptions', async () => {
      const userId = objectId();
      await createActiveCaseBankSub(userId);
      const mine = await subscriptionsService.getMySubscriptions(userId);
      expect(mine).toHaveLength(1);
    });

    it('getAllSubscribers reports active vs expired status', async () => {
      const admin = await createTestUser({ role: 'admin' });
      const activeUser = await createTestUser();
      const expiredUser = await createTestUser();
      await createActiveCaseBankSub(activeUser._id);
      await createActiveCaseBankSub(expiredUser._id, { currentPeriodEnd: new Date(Date.now() - DAY) });
      void admin;

      const subscribers = await subscriptionsService.getAllSubscribers();
      const statuses = subscribers.map((s) => s.status).sort();
      expect(statuses).toEqual(['active', 'expired']);
    });

    it('getCaseBankStatus / getCourseSubscriptionStatus report inactive when none exists', async () => {
      const userId = objectId();
      expect(await subscriptionsService.getCaseBankStatus(userId)).toEqual({ active: false });
      expect(await subscriptionsService.getCourseSubscriptionStatus(userId, objectId().toString())).toEqual({
        active: false,
      });
    });
  });

  describe('Stripe webhook helpers', () => {
    it('upsertFromStripe creates a new case_bank subscription', async () => {
      const userId = objectId();
      const created = await subscriptionsService.upsertFromStripe({
        userId,
        type: 'case_bank',
        billingInterval: 'monthly',
        stripeCustomerId: 'cus_1',
        stripeSubscriptionId: 'sub_1',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * DAY),
        status: 'active',
      });

      expect(created.stripeSubscriptionId).toBe('sub_1');
      expect(await Subscription.countDocuments({ userId, type: 'case_bank' })).toBe(1);
    });

    it('updateFromStripeSubscription ignores a stale (out-of-order) event', async () => {
      const userId = objectId();
      const sub = await createActiveCaseBankSub(userId, { lastStripeEventCreated: 1000 });

      const result = await subscriptionsService.updateFromStripeSubscription(
        fakeStripeSubscription({ id: sub.stripeSubscriptionId, status: 'past_due' }),
        500, // older than 1000
      );

      const reloaded = await Subscription.findById(sub._id);
      expect(reloaded!.status).toBe('active'); // unchanged
      expect(result!.status).toBe('active');
    });

    it('updateFromStripeSubscription blocks a cancelled subscription from resurrecting', async () => {
      const userId = objectId();
      const sub = await createActiveCaseBankSub(userId, { status: 'cancelled', lastStripeEventCreated: 100 });

      await subscriptionsService.updateFromStripeSubscription(
        fakeStripeSubscription({ id: sub.stripeSubscriptionId, status: 'active' }),
        200,
      );

      const reloaded = await Subscription.findById(sub._id);
      expect(reloaded!.status).toBe('cancelled');
    });

    it('updateFromStripeSubscription applies a valid in-order update', async () => {
      const userId = objectId();
      const sub = await createActiveCaseBankSub(userId, { lastStripeEventCreated: 100 });

      const updated = await subscriptionsService.updateFromStripeSubscription(
        fakeStripeSubscription({ id: sub.stripeSubscriptionId, status: 'past_due' }),
        200,
      );

      expect(updated!.status).toBe('past_due');
    });

    it('updateFromStripeSubscription returns null for an unknown subscription id', async () => {
      const result = await subscriptionsService.updateFromStripeSubscription(
        fakeStripeSubscription({ id: 'does-not-exist' }),
        100,
      );
      expect(result).toBeNull();
    });

    it('expireByStripeId marks the subscription cancelled', async () => {
      const userId = objectId();
      const sub = await createActiveCaseBankSub(userId);

      await subscriptionsService.expireByStripeId(sub.stripeSubscriptionId, 100);

      const reloaded = await Subscription.findById(sub._id);
      expect(reloaded!.status).toBe('cancelled');
    });

    it('getByStripeSubscriptionId finds by Stripe id', async () => {
      const userId = objectId();
      const sub = await createActiveCaseBankSub(userId);
      const found = await subscriptionsService.getByStripeSubscriptionId(sub.stripeSubscriptionId);
      expect(found?._id.toString()).toBe(sub._id.toString());
    });

    it('reconcileAllFromStripe re-syncs every subscription from Stripe', async () => {
      const userId = objectId();
      const sub = await createActiveCaseBankSub(userId);
      stripeMock.subscriptions.retrieve.mockResolvedValueOnce(
        fakeStripeSubscription({ id: sub.stripeSubscriptionId, status: 'past_due' }),
      );

      const result = await subscriptionsService.reconcileAllFromStripe();

      expect(result).toEqual({ synced: 1, errors: 0 });
      const reloaded = await Subscription.findById(sub._id);
      expect(reloaded!.status).toBe('past_due');
    });

    it('reconcileAllFromStripe counts failures without throwing', async () => {
      await createActiveCaseBankSub(objectId());
      stripeMock.subscriptions.retrieve.mockRejectedValueOnce(new Error('Stripe is down'));

      const result = await subscriptionsService.reconcileAllFromStripe();
      expect(result).toEqual({ synced: 0, errors: 1 });
    });
  });

  describe('cancelAllSubscriptionsForCourse', () => {
    it('cancels real Stripe subscriptions and skips manual ones, marking both cancelled locally', async () => {
      const courseId = objectId();
      const realSub = await createActiveCourseSub(objectId(), courseId, { stripeSubscriptionId: 'sub_real_1' });
      const manualSub = await createActiveCourseSub(objectId(), courseId, {
        stripeSubscriptionId: `manual_sub_${objectId().toString()}`,
      });

      await subscriptionsService.cancelAllSubscriptionsForCourse(courseId.toString());

      expect(stripeMock.subscriptions.cancel).toHaveBeenCalledTimes(1);
      expect(stripeMock.subscriptions.cancel).toHaveBeenCalledWith('sub_real_1');

      expect((await Subscription.findById(realSub._id))!.status).toBe('cancelled');
      expect((await Subscription.findById(manualSub._id))!.status).toBe('cancelled');
    });
  });

  describe('assertNotManual', () => {
    it('throws for a manual subscription and passes for a real one', async () => {
      const userId = objectId();
      const manual = await createActiveCaseBankSub(userId, { stripeSubscriptionId: `manual_sub_${userId}` });
      expect(() => subscriptionsService.assertNotManual(manual)).toThrow(/manually/);

      const real = await createActiveCaseBankSub(objectId(), { stripeSubscriptionId: 'sub_real_2' });
      expect(() => subscriptionsService.assertNotManual(real)).not.toThrow();
    });
  });

  describe('scheduleCancellation / resumeCancellation', () => {
    it('schedules and then resumes a course subscription cancellation', async () => {
      const userId = objectId();
      const courseId = objectId();
      await createActiveCourseSub(userId, courseId, { stripeSubscriptionId: 'sub_schedule_1' });

      const scheduled = await subscriptionsService.scheduleCancellation(userId, 'course', courseId.toString());
      expect(scheduled.cancelAtPeriodEnd).toBe(true);
      expect(stripeMock.subscriptions.update).toHaveBeenCalledWith('sub_schedule_1', {
        cancel_at_period_end: true,
      });

      await expect(
        subscriptionsService.scheduleCancellation(userId, 'course', courseId.toString()),
      ).rejects.toMatchObject({ statusCode: 400 });

      const resumed = await subscriptionsService.resumeCancellation(userId, 'course', courseId.toString());
      expect(resumed.cancelAtPeriodEnd).toBe(false);
    });

    it('throws 404 when there is no active subscription to cancel', async () => {
      await expect(
        subscriptionsService.scheduleCancellation(objectId(), 'course', objectId().toString()),
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it('rejects self-service changes on a manually-granted subscription', async () => {
      const userId = objectId();
      await createActiveCaseBankSub(userId, { stripeSubscriptionId: `manual_sub_${userId}` });

      await expect(subscriptionsService.scheduleCancellation(userId, 'case_bank')).rejects.toMatchObject({
        statusCode: 400,
      });
    });
  });

  describe('admin', () => {
    it('countActiveSubscriptions only counts active + unexpired', async () => {
      await createActiveCaseBankSub(objectId());
      await createActiveCaseBankSub(objectId(), { currentPeriodEnd: new Date(Date.now() - DAY) });
      expect(await subscriptionsService.countActiveSubscriptions()).toBe(1);
    });

    it('getUserCaseBankSubscription returns the most recent one', async () => {
      const userId = objectId();
      await createActiveCaseBankSub(userId, { stripeSubscriptionId: 'sub_old', status: 'cancelled' });
      await new Promise((r) => setTimeout(r, 5));
      await createActiveCaseBankSub(userId, { stripeSubscriptionId: 'sub_new' });

      const found = await subscriptionsService.getUserCaseBankSubscription(userId.toString());
      expect(found?.stripeSubscriptionId).toBe('sub_new');
    });

    describe('assertNoConflictingSubscription', () => {
      it('rejects a second active case bank subscription', async () => {
        const userId = objectId();
        await createActiveCaseBankSub(userId);
        await expect(subscriptionsService.assertNoConflictingSubscription(userId, 'case_bank')).rejects.toMatchObject(
          { statusCode: 409 },
        );
      });

      it('requires courseId for course subscriptions', async () => {
        await expect(subscriptionsService.assertNoConflictingSubscription(objectId(), 'course')).rejects.toMatchObject(
          { statusCode: 400 },
        );
      });

      it('rejects a second active course subscription for the same course', async () => {
        const userId = objectId();
        const courseId = objectId();
        await createActiveCourseSub(userId, courseId);
        await expect(
          subscriptionsService.assertNoConflictingSubscription(userId, 'course', courseId.toString()),
        ).rejects.toMatchObject({ statusCode: 409 });
      });
    });

    describe('manualGrantCaseBank', () => {
      it('grants comped access with a manual_ prefixed subscription id', async () => {
        const userId = objectId();
        const adminId = objectId();

        const sub = await subscriptionsService.manualGrantCaseBank(userId, adminId, 30);

        expect(sub.stripeSubscriptionId.startsWith('manual_')).toBe(true);
        expect(sub.grantedBy?.toString()).toBe(adminId.toString());
        expect(sub.status).toBe('active');
      });

      it('rejects when the user already has an active case bank subscription', async () => {
        const userId = objectId();
        await createActiveCaseBankSub(userId);

        await expect(subscriptionsService.manualGrantCaseBank(userId, objectId(), 30)).rejects.toMatchObject({
          statusCode: 409,
        });
      });
    });
  });
});
