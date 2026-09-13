jest.mock('../email/booking.email.service', () => ({
  sendBookingNotificationEmail: jest.fn().mockResolvedValue(undefined),
}));

import { Types } from 'mongoose';
import * as bookingService from './booking.service';
import { BookingProduct, SessionBooking } from '../model/booking.model';
import { sendBookingNotificationEmail } from '../email/booking.email.service';
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

describe('booking.service', () => {
  beforeEach(() => {
    mockedSendBookingNotificationEmail.mockClear();
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
      expect(updated.availableDates[0].isBooked).toBe(false);
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

    it('rejects removing a booked date', async () => {
      const product = await bookingService.createBookingProduct({ ...baseProductInput, isPublished: true }, objectId());
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

    it('hides booked dates from the public response', async () => {
      const product = await bookingService.createBookingProduct(baseProductInput, objectId());
      await bookingService.addAvailableDate(product._id.toString(), { date: new Date('2026-03-05') });
      await bookingService.addAvailableDate(product._id.toString(), { date: new Date('2026-03-06') });
      const user = await createTestUser();
      await bookingService.bookSession(product._id.toString(), { date: new Date('2026-03-05'), time: '10:00' }, user._id);

      const found = await bookingService.getPublishedBookingProductById(product._id.toString());
      expect(found.availableDates).toHaveLength(1);
    });

    it('throws 404 for an unpublished product', async () => {
      const product = await bookingService.createBookingProduct(baseProductInput, objectId());
      await bookingService.setBookingProductPublished(product._id.toString(), false);

      await expect(
        bookingService.getPublishedBookingProductById(product._id.toString()),
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('bookSession', () => {
    it('books an available date and time, creates a booking record, and emails the admin', async () => {
      const product = await bookingService.createBookingProduct(baseProductInput, objectId());
      await bookingService.addAvailableDate(product._id.toString(), { date: new Date('2026-03-05') });
      const user = await createTestUser({ fullName: 'Grace Hopper', email: 'grace@example.com' });

      const booking = await bookingService.bookSession(
        product._id.toString(),
        { date: new Date('2026-03-05'), time: '10:00' },
        user._id,
      );

      expect(booking.time).toBe('10:00');
      expect(booking.userId.toString()).toBe(user._id.toString());
      expect(await SessionBooking.countDocuments()).toBe(1);

      const updatedProduct = await BookingProduct.findById(product._id);
      expect(updatedProduct!.availableDates[0].isBooked).toBe(true);

      expect(mockedSendBookingNotificationEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          productTitle: baseProductInput.title,
          time: '10:00',
          bookedByName: 'Grace Hopper',
          bookedByEmail: 'grace@example.com',
        }),
      );
    });

    it('rejects a time not offered by the product', async () => {
      const product = await bookingService.createBookingProduct(baseProductInput, objectId());
      await bookingService.addAvailableDate(product._id.toString(), { date: new Date('2026-03-05') });
      const user = await createTestUser();

      await expect(
        bookingService.bookSession(product._id.toString(), { date: new Date('2026-03-05'), time: '23:00' }, user._id),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('rejects booking a date that was never made available', async () => {
      const product = await bookingService.createBookingProduct(baseProductInput, objectId());
      const user = await createTestUser();

      await expect(
        bookingService.bookSession(product._id.toString(), { date: new Date('2026-03-05'), time: '10:00' }, user._id),
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it('rejects a second booking for an already-booked date', async () => {
      const product = await bookingService.createBookingProduct(baseProductInput, objectId());
      await bookingService.addAvailableDate(product._id.toString(), { date: new Date('2026-03-05') });
      const user1 = await createTestUser();
      const user2 = await createTestUser();

      await bookingService.bookSession(product._id.toString(), { date: new Date('2026-03-05'), time: '10:00' }, user1._id);

      await expect(
        bookingService.bookSession(product._id.toString(), { date: new Date('2026-03-05'), time: '14:00' }, user2._id),
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
  });

  describe('deleteBookingProduct', () => {
    it('cascades and removes associated bookings', async () => {
      const product = await bookingService.createBookingProduct(baseProductInput, objectId());
      await bookingService.addAvailableDate(product._id.toString(), { date: new Date('2026-03-05') });
      const user = await createTestUser();
      await bookingService.bookSession(product._id.toString(), { date: new Date('2026-03-05'), time: '10:00' }, user._id);

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
    it('lists bookings across all products', async () => {
      const product = await bookingService.createBookingProduct(baseProductInput, objectId());
      await bookingService.addAvailableDate(product._id.toString(), { date: new Date('2026-03-05') });
      const user = await createTestUser();
      await bookingService.bookSession(product._id.toString(), { date: new Date('2026-03-05'), time: '10:00' }, user._id);

      const result = await bookingService.getAllBookings();
      expect(result.total).toBe(1);
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
