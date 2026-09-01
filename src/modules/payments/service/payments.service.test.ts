jest.mock('../../../config/stripe', () => require('../../../../tests/mocks/stripe.mock'));

import { Types } from 'mongoose';
import type Stripe from 'stripe';
import * as paymentsService from './payments.service';
import * as enrollmentsService from '../../enrollments/service/enrollments.service';
import { Payment } from '../model/payments.model';
import { Subscription } from '../../subscriptions/model/subscriptions.model';
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
          price: { product: 'prod_fake_123' },
          id: 'si_fake_123',
        },
      ],
    },
    ...overrides,
  }) as unknown as Stripe.Subscription;

const fakeInvoice = (overrides: Record<string, unknown> = {}): Stripe.Invoice =>
  ({
    id: 'in_fake_123',
    subscription: 'sub_fake_123',
    payment_intent: 'pi_fake_123',
    amount_paid: 2499,
    amount_due: 2499,
    currency: 'gbp',
    ...overrides,
  }) as unknown as Stripe.Invoice;

describe('payments.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createCheckoutSession', () => {
    it('builds a course checkout session with inline price_data', async () => {
      const admin = await createTestUser({ role: 'admin' });
      const course = await createTestCourse(admin._id, {
        pricing: { mocksessions_only: { monthly: 40 }, mocksession_and_lectures: { monthly: 70 } },
      });
      const userId = objectId();
      stripeMock.checkout.sessions.create.mockResolvedValueOnce({ id: 'cs_1', url: 'https://checkout.stripe.com/cs_1' });

      const result = await paymentsService.createCheckoutSession({
        userId,
        email: 'buyer@example.com',
        type: 'course',
        tier: 'mocksessions_only',
        interval: 'monthly',
        courseId: course._id.toString(),
      });

      expect(result).toEqual({ sessionId: 'cs_1', url: 'https://checkout.stripe.com/cs_1' });
      const callArgs = stripeMock.checkout.sessions.create.mock.calls[0][0];
      expect(callArgs.line_items[0].price_data.unit_amount).toBe(4000);
    });

    it('rejects checkout for an unpublished course', async () => {
      const admin = await createTestUser({ role: 'admin' });
      const course = await createTestCourse(admin._id, { isPublished: false });

      await expect(
        paymentsService.createCheckoutSession({
          userId: objectId(),
          email: 'buyer@example.com',
          type: 'course',
          tier: 'mocksessions_only',
          interval: 'monthly',
          courseId: course._id.toString(),
        }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('rejects when the requested tier/interval has no price set', async () => {
      const admin = await createTestUser({ role: 'admin' });
      const course = await createTestCourse(admin._id, {
        pricing: { mocksessions_only: { monthly: 40 }, mocksession_and_lectures: { monthly: 70 } },
      });

      await expect(
        paymentsService.createCheckoutSession({
          userId: objectId(),
          email: 'buyer@example.com',
          type: 'course',
          tier: 'mocksessions_only',
          interval: 'quarterly', // not set on this course
          courseId: course._id.toString(),
        }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('rejects a second checkout when a conflicting subscription already exists', async () => {
      const admin = await createTestUser({ role: 'admin' });
      const course = await createTestCourse(admin._id, {
        pricing: { mocksessions_only: { monthly: 40 }, mocksession_and_lectures: { monthly: 70 } },
      });
      const userId = objectId();
      await Subscription.create({
        userId,
        type: 'course',
        courseId: course._id,
        tier: 'mocksessions_only',
        billingInterval: 'monthly',
        status: 'active',
        stripeCustomerId: 'cus_x',
        stripeSubscriptionId: 'sub_x',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * DAY),
      });

      await expect(
        paymentsService.createCheckoutSession({
          userId,
          email: 'buyer@example.com',
          type: 'course',
          tier: 'mocksessions_only',
          interval: 'monthly',
          courseId: course._id.toString(),
        }),
      ).rejects.toMatchObject({ statusCode: 409 });
    });

    it('builds a case_bank checkout session from the configured Stripe price', async () => {
      stripeMock.checkout.sessions.create.mockResolvedValueOnce({ id: 'cs_2', url: 'https://checkout.stripe.com/cs_2' });

      const result = await paymentsService.createCheckoutSession({
        userId: objectId(),
        email: 'buyer@example.com',
        type: 'case_bank',
        interval: 'monthly',
      });

      expect(result.sessionId).toBe('cs_2');
      const callArgs = stripeMock.checkout.sessions.create.mock.calls[0][0];
      expect(callArgs.line_items[0].price).toBe('price_fake_case_bank_monthly');
    });
  });

  describe('handleWebhookEvent', () => {
    it('checkout.session.completed creates the subscription and grants course access', async () => {
      const admin = await createTestUser({ role: 'admin' });
      const user = await createTestUser();
      const course = await createTestCourse(admin._id);

      stripeMock.subscriptions.retrieve.mockResolvedValueOnce(
        fakeStripeSubscription({
          metadata: { userId: user._id.toString(), type: 'course', interval: 'monthly', courseId: course._id.toString(), tier: 'mocksessions_only' },
        }),
      );

      await paymentsService.handleWebhookEvent({
        type: 'checkout.session.completed',
        created: nowSeconds(),
        data: { object: { mode: 'subscription', subscription: 'sub_fake_123', metadata: {} } },
      } as unknown as Stripe.Event);

      const sub = await Subscription.findOne({ userId: user._id, type: 'course' });
      expect(sub).not.toBeNull();
      expect(sub!.status).toBe('active');

      const enrolled = await enrollmentsService.isEnrolled(user._id, course._id.toString());
      expect(enrolled).toBe(true);
    });

    it('invoice.payment_succeeded records a succeeded payment', async () => {
      const userId = objectId();
      await Subscription.create({
        userId,
        type: 'case_bank',
        billingInterval: 'monthly',
        status: 'active',
        stripeCustomerId: 'cus_fake_123',
        stripeSubscriptionId: 'sub_fake_123',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * DAY),
      });
      // handleInvoicePaymentSucceeded re-syncs via syncSubscriptionFromStripe,
      // which upserts off Stripe metadata (not just the subscription id) —
      // it needs userId/type/interval present to find the right local doc.
      stripeMock.subscriptions.retrieve.mockResolvedValueOnce(
        fakeStripeSubscription({ metadata: { userId: userId.toString(), type: 'case_bank', interval: 'monthly' } }),
      );

      await paymentsService.handleWebhookEvent({
        type: 'invoice.payment_succeeded',
        created: nowSeconds(),
        data: { object: fakeInvoice() },
      } as unknown as Stripe.Event);

      const payment = await Payment.findOne({ stripeInvoiceId: 'in_fake_123' });
      expect(payment?.status).toBe('succeeded');
      expect(payment?.amount).toBe(2499);
    });

    it('invoice.payment_failed records a failed payment', async () => {
      const userId = objectId();
      await Subscription.create({
        userId,
        type: 'case_bank',
        billingInterval: 'monthly',
        status: 'past_due',
        stripeCustomerId: 'cus_fake_123',
        stripeSubscriptionId: 'sub_fake_123',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * DAY),
      });

      await paymentsService.handleWebhookEvent({
        type: 'invoice.payment_failed',
        data: { object: fakeInvoice() },
      } as unknown as Stripe.Event);

      const payment = await Payment.findOne({ stripeInvoiceId: 'in_fake_123' });
      expect(payment?.status).toBe('failed');
    });

    it('invoice.voided marks the matching payment refunded', async () => {
      await Payment.create({
        userId: objectId(),
        amount: 2499,
        itemType: 'case_bank',
        status: 'succeeded',
        stripeInvoiceId: 'in_fake_123',
      });

      await paymentsService.handleWebhookEvent({
        type: 'invoice.voided',
        data: { object: fakeInvoice() },
      } as unknown as Stripe.Event);

      const payment = await Payment.findOne({ stripeInvoiceId: 'in_fake_123' });
      expect(payment?.status).toBe('refunded');
    });

    it('charge.refunded cancels the subscription and revokes course access on a full refund', async () => {
      const admin = await createTestUser({ role: 'admin' });
      const user = await createTestUser();
      const course = await createTestCourse(admin._id);
      await enrollmentsService.createEnrollmentFromSubscription(user._id, course._id.toString(), new Types.ObjectId(), 'mocksessions_only');

      const subscription = await Subscription.create({
        userId: user._id,
        type: 'course',
        courseId: course._id,
        tier: 'mocksessions_only',
        billingInterval: 'monthly',
        status: 'active',
        stripeCustomerId: 'cus_fake_123',
        stripeSubscriptionId: 'sub_fake_123',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * DAY),
      });
      await Payment.create({
        userId: user._id,
        subscriptionId: subscription._id,
        amount: 4000,
        itemType: 'course',
        status: 'succeeded',
        stripePaymentIntentId: 'pi_fake_123',
      });

      await paymentsService.handleWebhookEvent({
        type: 'charge.refunded',
        data: {
          object: { payment_intent: 'pi_fake_123', refunded: true, amount_refunded: 4000, amount: 4000 },
        },
      } as unknown as Stripe.Event);

      expect((await Subscription.findById(subscription._id))!.status).toBe('cancelled');
      expect(await enrollmentsService.isEnrolled(user._id, course._id.toString())).toBe(false);
      expect((await Payment.findOne({ stripePaymentIntentId: 'pi_fake_123' }))!.status).toBe('refunded');
    });

    it('customer.subscription.deleted expires the subscription and revokes access', async () => {
      const admin = await createTestUser({ role: 'admin' });
      const user = await createTestUser();
      const course = await createTestCourse(admin._id);
      await enrollmentsService.createEnrollmentFromSubscription(user._id, course._id.toString(), new Types.ObjectId(), 'mocksessions_only');
      await Subscription.create({
        userId: user._id,
        type: 'course',
        courseId: course._id,
        tier: 'mocksessions_only',
        billingInterval: 'monthly',
        status: 'active',
        stripeCustomerId: 'cus_fake_123',
        stripeSubscriptionId: 'sub_fake_123',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * DAY),
      });

      await paymentsService.handleWebhookEvent({
        type: 'customer.subscription.deleted',
        created: nowSeconds(),
        data: { object: fakeStripeSubscription() },
      } as unknown as Stripe.Event);

      const sub = await Subscription.findOne({ stripeSubscriptionId: 'sub_fake_123' });
      expect(sub!.status).toBe('cancelled');
      expect(await enrollmentsService.isEnrolled(user._id, course._id.toString())).toBe(false);
    });
  });

  describe('reads', () => {
    it('getMyPayments / getTotalRevenue / getRecentPayments', async () => {
      const userId = objectId();
      await Payment.create({ userId, amount: 1000, itemType: 'case_bank', status: 'succeeded', paidAt: new Date() });
      await Payment.create({ userId, amount: 500, itemType: 'case_bank', status: 'failed' });

      const mine = await paymentsService.getMyPayments(userId, 1, 20);
      expect(mine.total).toBe(2);

      const revenue = await paymentsService.getTotalRevenue();
      expect(revenue).toBe(1000);

      const recent = await paymentsService.getRecentPayments(10);
      expect(recent).toHaveLength(1);
    });
  });

  describe('createBillingPortalSession', () => {
    it('opens a portal session for the active subscription', async () => {
      const userId = objectId();
      await Subscription.create({
        userId,
        type: 'case_bank',
        billingInterval: 'monthly',
        status: 'active',
        stripeCustomerId: 'cus_portal_1',
        stripeSubscriptionId: 'sub_portal_1',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * DAY),
      });
      stripeMock.billingPortal.sessions.create.mockResolvedValueOnce({ url: 'https://billing.stripe.com/p/1' });

      const result = await paymentsService.createBillingPortalSession(userId);
      expect(result).toEqual({ url: 'https://billing.stripe.com/p/1' });
    });

    it('throws 404 when there is no active subscription', async () => {
      await expect(paymentsService.createBillingPortalSession(objectId())).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });

  describe('getCheckoutUser', () => {
    it('throws 404 for a missing user', async () => {
      await expect(paymentsService.getCheckoutUser(new Types.ObjectId())).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });
});
