jest.mock('../../../config/stripe', () => require('../../../../tests/mocks/stripe.mock'));

import { Types } from 'mongoose';
import type Stripe from 'stripe';
import * as liveCoursesService from './liveCourses.service';
import { LiveCourse } from '../model/liveCourses.model';
import { LiveCourseEnrollment } from '../model/liveCourseEnrollments.model';
import { stripeMock } from '../../../../tests/mocks/stripe.mock';
import { createTestUser, createTestLiveCourse, objectId } from '../../../../tests/helpers/factories';

const DAY = 24 * 60 * 60 * 1000;

// Simulates what payments.service.ts's webhook handler passes in — only the
// fields liveCourses.service.ts actually reads.
const fakeCheckoutSession = (overrides: Record<string, unknown> = {}): Stripe.Checkout.Session =>
  ({
    id: 'cs_fake_live_123',
    mode: 'payment',
    metadata: {},
    ...overrides,
  }) as unknown as Stripe.Checkout.Session;

// End-to-end helper: starts checkout, then simulates the webhook confirming
// payment, returning the confirmed enrollment.
const purchaseAndConfirm = async (courseId: string, userId: Types.ObjectId) => {
  const result = await liveCoursesService.purchaseLiveCourse(userId, courseId, {});
  return liveCoursesService.confirmLiveCoursePurchase(
    fakeCheckoutSession({
      id: result.sessionId,
      metadata: { type: 'live_course', courseId, userId: userId.toString() },
    }),
  );
};

describe('liveCourses.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    stripeMock.checkout.sessions.create.mockResolvedValue({
      id: 'cs_fake_live_123',
      url: 'https://checkout.stripe.com/cs_fake_live_123',
    });
  });

  describe('CRUD', () => {
    it('createLiveCourse creates a course owned by the admin', async () => {
      const admin = await createTestUser({ role: 'admin' });
      const course = await liveCoursesService.createLiveCourse(
        {
          title: 'MRCGP Live Weekend',
          description: 'A live weekend intensive.',
          price: 199,
          startDate: new Date(Date.now() + DAY),
          endDate: new Date(Date.now() + 3 * DAY),
        } as never,
        admin._id,
      );

      expect(course.title).toBe('MRCGP Live Weekend');
      expect((course as { thumbnailPublicId?: string }).thumbnailPublicId).toBeUndefined();
    });

    it('updateLiveCourse rejects an endDate that is not after startDate', async () => {
      const admin = await createTestUser({ role: 'admin' });
      const course = await createTestLiveCourse(admin._id);

      await expect(
        liveCoursesService.updateLiveCourse(course._id.toString(), {
          endDate: course.startDate,
        } as never),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('updateLiveCourse allows a valid date change', async () => {
      const admin = await createTestUser({ role: 'admin' });
      const course = await createTestLiveCourse(admin._id);
      const newEnd = new Date(course.endDate.getTime() + 7 * DAY);

      const updated = await liveCoursesService.updateLiveCourse(course._id.toString(), {
        endDate: newEnd,
      } as never);

      expect(new Date((updated as { endDate: Date }).endDate).getTime()).toBe(newEnd.getTime());
    });

    it('togglePublish flips isPublished', async () => {
      const admin = await createTestUser({ role: 'admin' });
      const course = await createTestLiveCourse(admin._id, { isPublished: false });

      const toggled = await liveCoursesService.togglePublish(course._id.toString());
      expect(toggled.isPublished).toBe(true);
    });

    it('setLiveCoursePaymentsPaused pauses and resumes', async () => {
      const admin = await createTestUser({ role: 'admin' });
      const course = await createTestLiveCourse(admin._id);

      const paused = await liveCoursesService.setLiveCoursePaymentsPaused(course._id.toString(), true);
      expect(paused.paymentsPaused).toBe(true);

      const resumed = await liveCoursesService.setLiveCoursePaymentsPaused(course._id.toString(), false);
      expect(resumed.paymentsPaused).toBe(false);
    });

    it('getAllPublishedLiveCourses only returns published courses', async () => {
      const admin = await createTestUser({ role: 'admin' });
      await createTestLiveCourse(admin._id, { isPublished: true });
      await createTestLiveCourse(admin._id, { isPublished: false });

      const published = await liveCoursesService.getAllPublishedLiveCourses();
      expect(published).toHaveLength(1);
    });

    it('getLiveCourseById 404s for an unpublished course', async () => {
      const admin = await createTestUser({ role: 'admin' });
      const course = await createTestLiveCourse(admin._id, { isPublished: false });

      await expect(
        liveCoursesService.getLiveCourseById(course._id.toString()),
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it('deleteLiveCourse cascades — deletes enrollment records and the course', async () => {
      const admin = await createTestUser({ role: 'admin' });
      const course = await createTestLiveCourse(admin._id);
      const user = await createTestUser();
      await purchaseAndConfirm(course._id.toString(), user._id);

      await liveCoursesService.deleteLiveCourse(course._id.toString());

      expect(await LiveCourse.findById(course._id)).toBeNull();
      expect(await LiveCourseEnrollment.countDocuments({ courseId: course._id })).toBe(0);
    });

    it('deleteLiveCourse throws 404 for a missing course', async () => {
      await expect(
        liveCoursesService.deleteLiveCourse(new Types.ObjectId().toString()),
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('purchaseLiveCourse', () => {
    it('creates a one-time (mode: payment) checkout session priced from the course', async () => {
      const admin = await createTestUser({ role: 'admin' });
      const course = await createTestLiveCourse(admin._id, { price: 150 });
      const user = await createTestUser();

      const result = await liveCoursesService.purchaseLiveCourse(user._id, course._id.toString(), {});

      expect(result.sessionId).toBe('cs_fake_live_123');
      const callArgs = stripeMock.checkout.sessions.create.mock.calls[0][0];
      expect(callArgs.mode).toBe('payment');
      expect(callArgs.line_items[0].price_data.unit_amount).toBe(15000);
      expect(callArgs.metadata).toMatchObject({
        type: 'live_course',
        courseId: course._id.toString(),
        userId: user._id.toString(),
      });
    });

    it('rejects an unpublished course', async () => {
      const admin = await createTestUser({ role: 'admin' });
      const course = await createTestLiveCourse(admin._id, { isPublished: false });
      const user = await createTestUser();

      await expect(
        liveCoursesService.purchaseLiveCourse(user._id, course._id.toString(), {}),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('rejects when payments are paused', async () => {
      const admin = await createTestUser({ role: 'admin' });
      const course = await createTestLiveCourse(admin._id, { paymentsPaused: true });
      const user = await createTestUser();

      await expect(
        liveCoursesService.purchaseLiveCourse(user._id, course._id.toString(), {}),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('rejects a course whose end date has already passed', async () => {
      const admin = await createTestUser({ role: 'admin' });
      const course = await createTestLiveCourse(admin._id, {
        startDate: new Date(Date.now() - 10 * DAY),
        endDate: new Date(Date.now() - 2 * DAY),
      });
      const user = await createTestUser();

      await expect(
        liveCoursesService.purchaseLiveCourse(user._id, course._id.toString(), {}),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('rejects a user who already has active access', async () => {
      const admin = await createTestUser({ role: 'admin' });
      const course = await createTestLiveCourse(admin._id);
      const user = await createTestUser();
      await purchaseAndConfirm(course._id.toString(), user._id);

      await expect(
        liveCoursesService.purchaseLiveCourse(user._id, course._id.toString(), {}),
      ).rejects.toMatchObject({ statusCode: 409 });
    });
  });

  describe('confirmLiveCoursePurchase', () => {
    it('grants access on successful checkout, upserting so retries are safe', async () => {
      const admin = await createTestUser({ role: 'admin' });
      const course = await createTestLiveCourse(admin._id);
      const user = await createTestUser();

      const enrollment = await purchaseAndConfirm(course._id.toString(), user._id);
      expect(enrollment?.isActive).toBe(true);
      expect(await liveCoursesService.isEnrolled(user._id, course._id.toString())).toBe(true);

      // Webhook retry — same session metadata, should not throw or duplicate
      await liveCoursesService.confirmLiveCoursePurchase(
        fakeCheckoutSession({
          metadata: { type: 'live_course', courseId: course._id.toString(), userId: user._id.toString() },
        }),
      );
      expect(await LiveCourseEnrollment.countDocuments({ userId: user._id, courseId: course._id })).toBe(1);
    });

    it('returns null when metadata is missing courseId/userId', async () => {
      const result = await liveCoursesService.confirmLiveCoursePurchase(fakeCheckoutSession());
      expect(result).toBeNull();
    });
  });

  describe('endLiveCourse', () => {
    it('revokes every active enrollment but leaves the course untouched', async () => {
      const admin = await createTestUser({ role: 'admin' });
      const course = await createTestLiveCourse(admin._id);
      const userA = await createTestUser();
      const userB = await createTestUser();
      await purchaseAndConfirm(course._id.toString(), userA._id);
      await purchaseAndConfirm(course._id.toString(), userB._id);

      await liveCoursesService.endLiveCourse(course._id.toString());

      const active = await LiveCourseEnrollment.countDocuments({ courseId: course._id, isActive: true });
      expect(active).toBe(0);
      const total = await LiveCourseEnrollment.countDocuments({ courseId: course._id });
      expect(total).toBe(2); // records kept, not deleted

      const reloaded = await LiveCourse.findById(course._id);
      expect(reloaded!.isPublished).toBe(true);
      expect(reloaded!.paymentsPaused).toBe(false);
    });

    it('throws 404 for a missing course', async () => {
      await expect(
        liveCoursesService.endLiveCourse(new Types.ObjectId().toString()),
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('manualEnroll / revokeEnrollment / restoreEnrollment', () => {
    it('grants comped access with source "manual"', async () => {
      const admin = await createTestUser({ role: 'admin' });
      const user = await createTestUser();
      const course = await createTestLiveCourse(admin._id);

      const enrollment = await liveCoursesService.manualEnroll(
        user._id.toString(),
        course._id.toString(),
        admin._id,
      );

      expect(enrollment.source).toBe('manual');
      expect(enrollment.isActive).toBe(true);
    });

    it('throws 409 when already actively enrolled', async () => {
      const admin = await createTestUser({ role: 'admin' });
      const user = await createTestUser();
      const course = await createTestLiveCourse(admin._id);
      await liveCoursesService.manualEnroll(user._id.toString(), course._id.toString(), admin._id);

      await expect(
        liveCoursesService.manualEnroll(user._id.toString(), course._id.toString(), admin._id),
      ).rejects.toMatchObject({ statusCode: 409 });
    });

    it('revoke deactivates, restore reactivates', async () => {
      const admin = await createTestUser({ role: 'admin' });
      const user = await createTestUser();
      const course = await createTestLiveCourse(admin._id);
      await liveCoursesService.manualEnroll(user._id.toString(), course._id.toString(), admin._id);

      await liveCoursesService.revokeEnrollment(user._id.toString(), course._id.toString());
      const revoked = await LiveCourseEnrollment.findOne({ userId: user._id, courseId: course._id });
      expect(revoked?.isActive).toBe(false);

      const restored = await liveCoursesService.restoreEnrollment(revoked!._id.toString());
      expect(restored.isActive).toBe(true);
    });
  });

  describe('reads', () => {
    it('getMyLiveCourseEnrollments only returns active enrollments', async () => {
      const admin = await createTestUser({ role: 'admin' });
      const user = await createTestUser();
      const courseA = await createTestLiveCourse(admin._id);
      const courseB = await createTestLiveCourse(admin._id);
      await purchaseAndConfirm(courseA._id.toString(), user._id);
      await purchaseAndConfirm(courseB._id.toString(), user._id);
      await liveCoursesService.revokeEnrollment(user._id.toString(), courseB._id.toString());

      const mine = await liveCoursesService.getMyLiveCourseEnrollments(user._id);
      expect(mine).toHaveLength(1);
    });

    it('getEnrollmentsForCourse paginates the roster', async () => {
      const admin = await createTestUser({ role: 'admin' });
      const course = await createTestLiveCourse(admin._id);
      const userA = await createTestUser();
      const userB = await createTestUser();
      await purchaseAndConfirm(course._id.toString(), userA._id);
      await purchaseAndConfirm(course._id.toString(), userB._id);

      const result = await liveCoursesService.getEnrollmentsForCourse(course._id.toString(), 1, 20);
      expect(result.total).toBe(2);
    });
  });
});
