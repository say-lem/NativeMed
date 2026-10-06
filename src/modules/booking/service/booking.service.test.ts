jest.mock('../../../config/stripe', () => require('../../../../tests/mocks/stripe.mock'));
jest.mock('../email/booking.email.service', () => ({
  sendBookingNotificationEmail: jest.fn().mockResolvedValue(undefined),
}));

import { Types } from 'mongoose';
import type Stripe from 'stripe';
import * as bookingService from './booking.service';
import { BookingProduct, SessionBooking } from '../model/booking.model';
import { sendBookingNotificationEmail } from '../email/booking.email.service';
import { stripeMock } from '../../../../tests/mocks/stripe.mock';
import { createTestUser, objectId } from '../../../../tests/helpers/factories';

const mockedSendBookingNotificationEmail = sendBookingNotificationEmail as jest.MockedFunction<
  typeof sendBookingNotificationEmail
>;

const baseProductInput = {
  title: 'Career Coaching Session',
  description: 'A one-on-one session to review your CV and exam strategy.',
  price: 50,
  availableTimes: ['10:00', '14:00'],
};

// Simulates what payments.service.ts's webhook handler passes in — only the
// fields booking.service.ts actually reads.
const fakeCheckoutSession = (overrides: Record<string, unknown> = {}): Stripe.Checkout.Session =>
  ({
    id: 'cs_fake_123',
    mode: 'payment',
    payment_intent: 'pi_fake_123',
    amount_total: 5000,
    currency: 'gbp',
    metadata: {},
    ...overrides,
  }) as unknown as Stripe.Checkout.Session;

// End-to-end helper: starts checkout, then simulates the webhook confirming
// payment, returning the confirmed booking.
const bookAndConfirm = async (productId: string, input: { date: Date; time: string }, userId: Types.ObjectId) => {
  const checkout = await bookingService.bookSession(productId, input, userId);
  const confirmed = await bookingService.confirmBookingPayment(
    fakeCheckoutSession({ metadata: { bookingId: checkout.bookingId.toString() } }),
  );
  return { checkout, confirmed: confirmed! };
};

let checkoutSessionCounter = 0;

describe('booking.service', () => {
  beforeEach(() => {
    mockedSendBookingNotificationEmail.mockClear();
    stripeMock.checkout.sessions.create.mockReset();
    stripeMock.checkout.sessions.retrieve.mockReset();
    checkoutSessionCounter = 0;
    stripeMock.checkout.sessions.create.mockImplementation(async () => {
      checkoutSessionCounter += 1;
      const id = `cs_fake_${checkoutSessionCounter}`;
      return { id, url: `https://checkout.stripe.com/${id}` };
    });
  });

  describe('createBookingProduct', () => {
    it('creates a product with the given fields', async () => {
      const product = await bookingService.createBookingProduct(baseProductInput, objectId());

      expect(product.title).toBe(baseProductInput.title);
      expect(product.price).toBe(50);
      expect(product.availableTimes).toEqual(['10:00', '14:00']);
      expect(product.isPublished).toBe(true);
      expect(product.availableDates).toHaveLength(0);
    });
  });

  describe('addAvailableDate / removeAvailableDate', () => {
    it('adds a date to the pool', async () => {
      const product = await bookingService.createBookingProduct(baseProductInput, objectId());

      const updated = await bookingService.addAvailableDate(product._id.toString(), { date: new Date('2026-03-05') });

      expect(updated.availableDates).toHaveLength(1);
      expect(updated.availableDates[0].bookedTimes).toEqual([]);
    });

    it('rejects adding the same calendar date twice', async () => {
      const product = await bookingService.createBookingProduct(baseProductInput, objectId());
      await bookingService.addAvailableDate(product._id.toString(), { date: new Date('2026-03-05T09:00:00Z') });

      await expect(
        bookingService.addAvailableDate(product._id.toString(), { date: new Date('2026-03-05T18:00:00Z') }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('removes an unbooked date', async () => {
      const product = await bookingService.createBookingProduct(baseProductInput, objectId());
      const updated = await bookingService.addAvailableDate(product._id.toString(), { date: new Date('2026-03-05') });
      const dateId = updated.availableDates[0]._id.toString();

      const result = await bookingService.removeAvailableDate(product._id.toString(), dateId);
      expect(result.availableDates).toHaveLength(0);
    });

    it('throws 404 removing a missing date', async () => {
      const product = await bookingService.createBookingProduct(baseProductInput, objectId());

      await expect(
        bookingService.removeAvailableDate(product._id.toString(), new Types.ObjectId().toString()),
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it('rejects removing a date that already has a pending (unpaid) checkout on it', async () => {
      const product = await bookingService.createBookingProduct(baseProductInput, objectId());
      const withDate = await bookingService.addAvailableDate(product._id.toString(), { date: new Date('2026-03-05') });
      const dateId = withDate.availableDates[0]._id.toString();
      const user = await createTestUser();

      await bookingService.bookSession(product._id.toString(), { date: new Date('2026-03-05'), time: '10:00' }, user._id);

      await expect(
        bookingService.removeAvailableDate(product._id.toString(), dateId),
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe('getPublishedBookingProducts / getPublishedBookingProductById', () => {
    it('only returns published products', async () => {
      await bookingService.createBookingProduct(baseProductInput, objectId());
      const unpublished = await bookingService.createBookingProduct(baseProductInput, objectId());
      await bookingService.setBookingProductPublished(unpublished._id.toString(), false);

      const result = await bookingService.getPublishedBookingProducts();
      expect(result.total).toBe(1);
    });

    it('keeps a date visible with the held time marked unavailable as soon as checkout starts', async () => {
      const product = await bookingService.createBookingProduct(baseProductInput, objectId());
      await bookingService.addAvailableDate(product._id.toString(), { date: new Date('2026-03-05') });
      const user = await createTestUser();
      await bookingService.bookSession(product._id.toString(), { date: new Date('2026-03-05'), time: '10:00' }, user._id);

      const found = await bookingService.getPublishedBookingProductById(product._id.toString());
      expect(found.availableDates).toHaveLength(1);
      expect(found.availableDates[0].times).toEqual([
        { time: '10:00', isAvailable: false },
        { time: '14:00', isAvailable: true },
      ]);
    });

    it('hides a date only once every time slot on it is held/booked', async () => {
      const product = await bookingService.createBookingProduct(baseProductInput, objectId());
      await bookingService.addAvailableDate(product._id.toString(), { date: new Date('2026-03-05') });
      await bookingService.addAvailableDate(product._id.toString(), { date: new Date('2026-03-06') });
      const user = await createTestUser();
      await bookingService.bookSession(product._id.toString(), { date: new Date('2026-03-05'), time: '10:00' }, user._id);
      await bookingService.bookSession(product._id.toString(), { date: new Date('2026-03-05'), time: '14:00' }, user._id);

      const found = await bookingService.getPublishedBookingProductById(product._id.toString());
      expect(found.availableDates).toHaveLength(1);
      expect(found.availableDates[0].date).toEqual(new Date('2026-03-06'));
    });

    it('throws 404 for an unpublished product', async () => {
      const product = await bookingService.createBookingProduct(baseProductInput, objectId());
      await bookingService.setBookingProductPublished(product._id.toString(), false);

      await expect(
        bookingService.getPublishedBookingProductById(product._id.toString()),
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('bookSession (starts checkout, does not confirm the booking)', () => {
    it('reserves the slot and creates a pending booking without emailing the admin yet', async () => {
      const product = await bookingService.createBookingProduct(baseProductInput, objectId());
      await bookingService.addAvailableDate(product._id.toString(), { date: new Date('2026-03-05') });
      const user = await createTestUser({ fullName: 'Grace Hopper', email: 'grace@example.com' });

      const checkout = await bookingService.bookSession(
        product._id.toString(),
        { date: new Date('2026-03-05'), time: '10:00' },
        user._id,
      );

      expect(checkout).toEqual({
        bookingId: expect.anything(),
        sessionId: expect.stringMatching(/^cs_fake_\d+$/),
        url: expect.stringMatching(/^https:\/\/checkout\.stripe\.com\/cs_fake_\d+$/),
        paymentInitiatedAt: expect.any(Date),
        expiresAt: expect.any(Date),
      });
      expect(checkout.expiresAt.getTime() - checkout.paymentInitiatedAt.getTime()).toBe(60 * 60 * 1000);

      const booking = await SessionBooking.findById(checkout.bookingId);
      expect(booking!.status).toBe('pending');
      expect(booking!.stripeCheckoutSessionId).toBe(checkout.sessionId);

      const updatedProduct = await BookingProduct.findById(product._id);
      expect(updatedProduct!.availableDates[0].bookedTimes).toEqual(['10:00']);

      expect(mockedSendBookingNotificationEmail).not.toHaveBeenCalled();

      const callArgs = stripeMock.checkout.sessions.create.mock.calls[0][0];
      expect(callArgs.mode).toBe('payment');
      expect(callArgs.line_items[0].price_data.unit_amount).toBe(5000);
      expect(callArgs.metadata).toMatchObject({ type: 'booking', productId: product._id.toString() });
      expect(callArgs.expires_at).toBe(Math.floor(checkout.expiresAt.getTime() / 1000));
    });

    it("exposes the booking's payment window on its JSON representation while pending", async () => {
      const product = await bookingService.createBookingProduct(baseProductInput, objectId());
      await bookingService.addAvailableDate(product._id.toString(), { date: new Date('2026-03-05') });
      const user = await createTestUser();

      const checkout = await bookingService.bookSession(
        product._id.toString(),
        { date: new Date('2026-03-05'), time: '10:00' },
        user._id,
      );

      const booking = await SessionBooking.findById(checkout.bookingId);
      const json = booking!.toJSON() as unknown as Record<string, unknown>;
      expect(new Date(json.paymentInitiatedAt as string).getTime()).toBe(booking!.createdAt.getTime());
      expect(new Date(json.paymentExpiresAt as string).getTime()).toBe(
        booking!.createdAt.getTime() + 60 * 60 * 1000,
      );
    });

    it('rolls back the reservation if Stripe checkout creation fails', async () => {
      const product = await bookingService.createBookingProduct(baseProductInput, objectId());
      await bookingService.addAvailableDate(product._id.toString(), { date: new Date('2026-03-05') });
      const user = await createTestUser();
      stripeMock.checkout.sessions.create.mockRejectedValueOnce(new Error('Stripe is down'));

      await expect(
        bookingService.bookSession(product._id.toString(), { date: new Date('2026-03-05'), time: '10:00' }, user._id),
      ).rejects.toThrow('Stripe is down');

      const updatedProduct = await BookingProduct.findById(product._id);
      expect(updatedProduct!.availableDates[0].bookedTimes).toEqual([]);
      expect(await SessionBooking.countDocuments()).toBe(0);
    });

    it('rejects a time not offered by the product', async () => {
      const product = await bookingService.createBookingProduct(baseProductInput, objectId());
      await bookingService.addAvailableDate(product._id.toString(), { date: new Date('2026-03-05') });
      const user = await createTestUser();

      await expect(
        bookingService.bookSession(product._id.toString(), { date: new Date('2026-03-05'), time: '23:00' }, user._id),
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
    });

    it('rejects booking a date that was never made available', async () => {
      const product = await bookingService.createBookingProduct(baseProductInput, objectId());
      const user = await createTestUser();

      await expect(
        bookingService.bookSession(product._id.toString(), { date: new Date('2026-03-05'), time: '10:00' }, user._id),
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it('allows a different time to be held on the same date', async () => {
      const product = await bookingService.createBookingProduct(baseProductInput, objectId());
      await bookingService.addAvailableDate(product._id.toString(), { date: new Date('2026-03-05') });
      const user1 = await createTestUser();
      const user2 = await createTestUser();

      await bookingService.bookSession(product._id.toString(), { date: new Date('2026-03-05'), time: '10:00' }, user1._id);
      const second = await bookingService.bookSession(
        product._id.toString(),
        { date: new Date('2026-03-05'), time: '14:00' },
        user2._id,
      );

      expect(second.sessionId).toEqual(expect.stringMatching(/^cs_fake_\d+$/));
      const updatedProduct = await BookingProduct.findById(product._id);
      expect(updatedProduct!.availableDates[0].bookedTimes.sort()).toEqual(['10:00', '14:00']);
    });

    it('rejects starting a second checkout for the same date and time slot', async () => {
      const product = await bookingService.createBookingProduct(baseProductInput, objectId());
      await bookingService.addAvailableDate(product._id.toString(), { date: new Date('2026-03-05') });
      const user1 = await createTestUser();
      const user2 = await createTestUser();

      await bookingService.bookSession(product._id.toString(), { date: new Date('2026-03-05'), time: '10:00' }, user1._id);

      await expect(
        bookingService.bookSession(product._id.toString(), { date: new Date('2026-03-05'), time: '10:00' }, user2._id),
      ).rejects.toMatchObject({ statusCode: 409 });
    });

    it('throws 404 for an unpublished product', async () => {
      const product = await bookingService.createBookingProduct(baseProductInput, objectId());
      await bookingService.addAvailableDate(product._id.toString(), { date: new Date('2026-03-05') });
      await bookingService.setBookingProductPublished(product._id.toString(), false);
      const user = await createTestUser();

      await expect(
        bookingService.bookSession(product._id.toString(), { date: new Date('2026-03-05'), time: '10:00' }, user._id),
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it('rejects a product with no valid price', async () => {
      const product = await bookingService.createBookingProduct({ ...baseProductInput, price: 0 }, objectId());
      await bookingService.addAvailableDate(product._id.toString(), { date: new Date('2026-03-05') });
      const user = await createTestUser();

      await expect(
        bookingService.bookSession(product._id.toString(), { date: new Date('2026-03-05'), time: '10:00' }, user._id),
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe('resumeBookingPayment', () => {
    it("returns the same checkout session's URL for a still-pending booking", async () => {
      const product = await bookingService.createBookingProduct(baseProductInput, objectId());
      await bookingService.addAvailableDate(product._id.toString(), { date: new Date('2026-03-05') });
      const user = await createTestUser();

      const checkout = await bookingService.bookSession(
        product._id.toString(),
        { date: new Date('2026-03-05'), time: '10:00' },
        user._id,
      );
      stripeMock.checkout.sessions.retrieve.mockResolvedValueOnce({
        id: checkout.sessionId,
        url: checkout.url,
        status: 'open',
      });

      const resumed = await bookingService.resumeBookingPayment(checkout.bookingId.toString(), user._id);

      expect(stripeMock.checkout.sessions.retrieve).toHaveBeenCalledWith(checkout.sessionId);
      expect(resumed).toEqual({
        bookingId: checkout.bookingId,
        sessionId: checkout.sessionId,
        url: checkout.url,
        paymentInitiatedAt: checkout.paymentInitiatedAt,
        expiresAt: checkout.expiresAt,
      });
    });

    it('rejects resuming a booking that belongs to another user', async () => {
      const product = await bookingService.createBookingProduct(baseProductInput, objectId());
      await bookingService.addAvailableDate(product._id.toString(), { date: new Date('2026-03-05') });
      const owner = await createTestUser();
      const intruder = await createTestUser();

      const checkout = await bookingService.bookSession(
        product._id.toString(),
        { date: new Date('2026-03-05'), time: '10:00' },
        owner._id,
      );

      await expect(
        bookingService.resumeBookingPayment(checkout.bookingId.toString(), intruder._id),
      ).rejects.toMatchObject({ statusCode: 404 });
      expect(stripeMock.checkout.sessions.retrieve).not.toHaveBeenCalled();
    });

    it('rejects resuming a booking that has already been confirmed', async () => {
      const product = await bookingService.createBookingProduct(baseProductInput, objectId());
      await bookingService.addAvailableDate(product._id.toString(), { date: new Date('2026-03-05') });
      const user = await createTestUser();

      const { checkout } = await bookAndConfirm(
        product._id.toString(),
        { date: new Date('2026-03-05'), time: '10:00' },
        user._id,
      );

      await expect(
        bookingService.resumeBookingPayment(checkout.bookingId.toString(), user._id),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('rejects resuming a booking whose hour-long payment window has passed', async () => {
      const product = await bookingService.createBookingProduct(baseProductInput, objectId());
      await bookingService.addAvailableDate(product._id.toString(), { date: new Date('2026-03-05') });
      const user = await createTestUser();

      const checkout = await bookingService.bookSession(
        product._id.toString(),
        { date: new Date('2026-03-05'), time: '10:00' },
        user._id,
      );
      // Bypasses mongoose's update layer (which strips an explicit createdAt
      // out of the update doc, treating it as creation-only) to directly
      // backdate the booking past its payment window.
      await SessionBooking.collection.updateOne(
        { _id: checkout.bookingId },
        { $set: { createdAt: new Date(Date.now() - 61 * 60 * 1000) } },
      );

      await expect(
        bookingService.resumeBookingPayment(checkout.bookingId.toString(), user._id),
      ).rejects.toMatchObject({ statusCode: 410 });
      expect(stripeMock.checkout.sessions.retrieve).not.toHaveBeenCalled();
    });

    it('rejects resuming when Stripe reports the session itself has already expired', async () => {
      const product = await bookingService.createBookingProduct(baseProductInput, objectId());
      await bookingService.addAvailableDate(product._id.toString(), { date: new Date('2026-03-05') });
      const user = await createTestUser();

      const checkout = await bookingService.bookSession(
        product._id.toString(),
        { date: new Date('2026-03-05'), time: '10:00' },
        user._id,
      );
      stripeMock.checkout.sessions.retrieve.mockResolvedValueOnce({
        id: checkout.sessionId,
        url: null,
        status: 'expired',
      });

      await expect(
        bookingService.resumeBookingPayment(checkout.bookingId.toString(), user._id),
      ).rejects.toMatchObject({ statusCode: 410 });
    });
  });

  describe('confirmBookingPayment', () => {
    it('marks the booking confirmed and emails the admin', async () => {
      const product = await bookingService.createBookingProduct(baseProductInput, objectId());
      await bookingService.addAvailableDate(product._id.toString(), { date: new Date('2026-03-05') });
      const user = await createTestUser({ fullName: 'Grace Hopper', email: 'grace@example.com' });

      const { confirmed } = await bookAndConfirm(
        product._id.toString(),
        { date: new Date('2026-03-05'), time: '10:00' },
        user._id,
      );

      expect(confirmed.status).toBe('confirmed');
      expect(mockedSendBookingNotificationEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          productTitle: baseProductInput.title,
          time: '10:00',
          bookedByName: 'Grace Hopper',
          bookedByEmail: 'grace@example.com',
        }),
      );
    });

    it('does not release the slot or re-email on a duplicate webhook delivery', async () => {
      const product = await bookingService.createBookingProduct(baseProductInput, objectId());
      await bookingService.addAvailableDate(product._id.toString(), { date: new Date('2026-03-05') });
      const user = await createTestUser();

      const { checkout } = await bookAndConfirm(
        product._id.toString(),
        { date: new Date('2026-03-05'), time: '10:00' },
        user._id,
      );
      mockedSendBookingNotificationEmail.mockClear();

      await bookingService.confirmBookingPayment(
        fakeCheckoutSession({ metadata: { bookingId: checkout.bookingId.toString() } }),
      );

      expect(mockedSendBookingNotificationEmail).not.toHaveBeenCalled();
      const updatedProduct = await BookingProduct.findById(product._id);
      expect(updatedProduct!.availableDates[0].bookedTimes).toEqual(['10:00']);
    });

    it('returns null when the session has no bookingId metadata', async () => {
      const result = await bookingService.confirmBookingPayment(fakeCheckoutSession({ metadata: {} }));
      expect(result).toBeNull();
    });
  });

  describe('releasePendingBooking', () => {
    it('frees the slot and marks the booking cancelled', async () => {
      const product = await bookingService.createBookingProduct(baseProductInput, objectId());
      await bookingService.addAvailableDate(product._id.toString(), { date: new Date('2026-03-05') });
      const user = await createTestUser();

      const checkout = await bookingService.bookSession(
        product._id.toString(),
        { date: new Date('2026-03-05'), time: '10:00' },
        user._id,
      );

      await bookingService.releasePendingBooking(
        fakeCheckoutSession({ metadata: { bookingId: checkout.bookingId.toString() } }),
      );

      const booking = await SessionBooking.findById(checkout.bookingId);
      expect(booking!.status).toBe('cancelled');

      const updatedProduct = await BookingProduct.findById(product._id);
      expect(updatedProduct!.availableDates[0].bookedTimes).toEqual([]);
    });

    it('lets a new checkout claim the slot after it is released', async () => {
      const product = await bookingService.createBookingProduct(baseProductInput, objectId());
      await bookingService.addAvailableDate(product._id.toString(), { date: new Date('2026-03-05') });
      const user1 = await createTestUser();
      const user2 = await createTestUser();

      const checkout = await bookingService.bookSession(
        product._id.toString(),
        { date: new Date('2026-03-05'), time: '10:00' },
        user1._id,
      );
      await bookingService.releasePendingBooking(
        fakeCheckoutSession({ metadata: { bookingId: checkout.bookingId.toString() } }),
      );

      await expect(
        bookingService.bookSession(product._id.toString(), { date: new Date('2026-03-05'), time: '10:00' }, user2._id),
      ).resolves.toMatchObject({ sessionId: expect.stringMatching(/^cs_fake_\d+$/) });
    });

    it('does nothing for an already-confirmed booking', async () => {
      const product = await bookingService.createBookingProduct(baseProductInput, objectId());
      await bookingService.addAvailableDate(product._id.toString(), { date: new Date('2026-03-05') });
      const user = await createTestUser();

      const { checkout } = await bookAndConfirm(
        product._id.toString(),
        { date: new Date('2026-03-05'), time: '10:00' },
        user._id,
      );

      await bookingService.releasePendingBooking(
        fakeCheckoutSession({ metadata: { bookingId: checkout.bookingId.toString() } }),
      );

      const booking = await SessionBooking.findById(checkout.bookingId);
      expect(booking!.status).toBe('confirmed');
      const updatedProduct = await BookingProduct.findById(product._id);
      expect(updatedProduct!.availableDates[0].bookedTimes).toEqual(['10:00']);
    });
  });

  describe('deleteBookingProduct', () => {
    it('cascades and removes associated bookings', async () => {
      const product = await bookingService.createBookingProduct(baseProductInput, objectId());
      await bookingService.addAvailableDate(product._id.toString(), { date: new Date('2026-03-05') });
      const user = await createTestUser();
      await bookAndConfirm(product._id.toString(), { date: new Date('2026-03-05'), time: '10:00' }, user._id);

      await bookingService.deleteBookingProduct(product._id.toString());

      expect(await BookingProduct.findById(product._id)).toBeNull();
      expect(await SessionBooking.countDocuments({ productId: product._id })).toBe(0);
    });

    it('throws 404 for a missing product', async () => {
      await expect(
        bookingService.deleteBookingProduct(new Types.ObjectId().toString()),
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('getAllBookings (admin)', () => {
    it('lists bookings across all products, including pending ones', async () => {
      const product = await bookingService.createBookingProduct(baseProductInput, objectId());
      await bookingService.addAvailableDate(product._id.toString(), { date: new Date('2026-03-05') });
      const user = await createTestUser();
      await bookingService.bookSession(product._id.toString(), { date: new Date('2026-03-05'), time: '10:00' }, user._id);

      const result = await bookingService.getAllBookings();
      expect(result.total).toBe(1);
      expect(result.items[0].status).toBe('pending');
    });
  });

  describe('getMyBookings', () => {
    it('only returns bookings belonging to the given user', async () => {
      const product = await bookingService.createBookingProduct(baseProductInput, objectId());
      await bookingService.addAvailableDate(product._id.toString(), { date: new Date('2026-03-05') });
      await bookingService.addAvailableDate(product._id.toString(), { date: new Date('2026-03-06') });
      const user1 = await createTestUser();
      const user2 = await createTestUser();
      await bookingService.bookSession(product._id.toString(), { date: new Date('2026-03-05'), time: '10:00' }, user1._id);
      await bookingService.bookSession(product._id.toString(), { date: new Date('2026-03-06'), time: '10:00' }, user2._id);

      const result = await bookingService.getMyBookings(user1._id);

      expect(result.total).toBe(1);
      expect(result.items[0].userId.toString()).toBe(user1._id.toString());
    });

    it('populates product title/description/price', async () => {
      const product = await bookingService.createBookingProduct(baseProductInput, objectId());
      await bookingService.addAvailableDate(product._id.toString(), { date: new Date('2026-03-05') });
      const user = await createTestUser();
      await bookingService.bookSession(product._id.toString(), { date: new Date('2026-03-05'), time: '10:00' }, user._id);

      const result = await bookingService.getMyBookings(user._id);

      expect(result.items[0].productId).toMatchObject({ title: baseProductInput.title, price: baseProductInput.price });
    });

    it('returns an empty list for a user with no bookings', async () => {
      const result = await bookingService.getMyBookings(objectId());
      expect(result.total).toBe(0);
      expect(result.items).toHaveLength(0);
    });

    it('paginates results', async () => {
      const product = await bookingService.createBookingProduct(baseProductInput, objectId());
      const user = await createTestUser();
      for (const day of ['2026-03-01', '2026-03-02', '2026-03-03']) {
        await bookingService.addAvailableDate(product._id.toString(), { date: new Date(day) });
        await bookingService.bookSession(product._id.toString(), { date: new Date(day), time: '10:00' }, user._id);
      }

      const page1 = await bookingService.getMyBookings(user._id, 1, 2);
      const page2 = await bookingService.getMyBookings(user._id, 2, 2);

      expect(page1.items).toHaveLength(2);
      expect(page2.items).toHaveLength(1);
      expect(page1.totalPages).toBe(2);
    });
  });
});
