import { Types } from 'mongoose';
import { AppError } from '../../../shared/utils/appError';
import { User } from '../../auth/model/auth.model';
import { BookingProduct, SessionBooking } from '../model/booking.model';
import { sendBookingNotificationEmail } from '../email/booking.email.service';
import {
  CreateBookingProductInput,
  UpdateBookingProductInput,
  AddAvailableDateInput,
  BookSessionInput,
} from '../schema/booking.schema';

// Dates are compared by calendar day only — strip the time component so an
// admin-added date and a user-booked date always line up regardless of the
// time-of-day either was submitted with.
const toDayStart = (date: Date): Date => {
  const normalized = new Date(date);
  normalized.setUTCHours(0, 0, 0, 0);
  return normalized;
};

// ─────────────────────────────────────────────────────────────────────────────
// Admin — manage products
// ─────────────────────────────────────────────────────────────────────────────

export const createBookingProduct = async (
  input: CreateBookingProductInput,
  createdBy: Types.ObjectId,
) => {
  return BookingProduct.create({ ...input, createdBy });
};

export const getAllBookingProducts = async (page = 1, limit = 20) => {
  const [items, total] = await Promise.all([
    BookingProduct.find()
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    BookingProduct.countDocuments(),
  ]);
  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
};

export const updateBookingProduct = async (productId: string, input: UpdateBookingProductInput) => {
  const product = await BookingProduct.findById(productId);
  if (!product) throw new AppError('Booking product not found', 404);

  Object.assign(product, input);
  await product.save();

  return product;
};

export const setBookingProductPublished = async (productId: string, isPublished: boolean) => {
  return updateBookingProduct(productId, { isPublished });
};

export const deleteBookingProduct = async (productId: string): Promise<void> => {
  const product = await BookingProduct.findByIdAndDelete(productId);
  if (!product) throw new AppError('Booking product not found', 404);

  await SessionBooking.deleteMany({ productId });
};

// ─────────────────────────────────────────────────────────────────────────────
// Admin — manage available dates
// ─────────────────────────────────────────────────────────────────────────────

export const addAvailableDate = async (productId: string, input: AddAvailableDateInput) => {
  const product = await BookingProduct.findById(productId);
  if (!product) throw new AppError('Booking product not found', 404);

  const day = toDayStart(input.date);
  const exists = product.availableDates.some((d) => d.date.getTime() === day.getTime());
  if (exists) throw new AppError('That date has already been added', 400);

  product.availableDates.push({ date: day, isBooked: false });
  await product.save();

  return product;
};

export const removeAvailableDate = async (productId: string, dateId: string) => {
  const product = await BookingProduct.findById(productId);
  if (!product) throw new AppError('Booking product not found', 404);

  const entry = product.availableDates.id(dateId);
  if (!entry) throw new AppError('Date not found', 404);
  if (entry.isBooked) throw new AppError('Cannot remove a date that has already been booked', 400);

  product.availableDates.pull(dateId);
  await product.save();

  return product;
};

// ─────────────────────────────────────────────────────────────────────────────
// Admin — view bookings
// ─────────────────────────────────────────────────────────────────────────────

export const getAllBookings = async (page = 1, limit = 20) => {
  const [items, total] = await Promise.all([
    SessionBooking.find()
      .populate('productId', 'title price')
      .populate('userId', 'fullName email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    SessionBooking.countDocuments(),
  ]);
  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
};

// ─────────────────────────────────────────────────────────────────────────────
// Public — published products, with only still-available dates shown
// ─────────────────────────────────────────────────────────────────────────────

const withOnlyAvailableDates = (product: InstanceType<typeof BookingProduct>) => {
  const json = product.toJSON() as unknown as Record<string, unknown> & { availableDates: { isBooked: boolean }[] };
  json.availableDates = json.availableDates.filter((d) => !d.isBooked);
  return json;
};

export const getPublishedBookingProducts = async (page = 1, limit = 20) => {
  const filter = { isPublished: true };
  const [items, total] = await Promise.all([
    BookingProduct.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    BookingProduct.countDocuments(filter),
  ]);
  return { items: items.map(withOnlyAvailableDates), total, page, limit, totalPages: Math.ceil(total / limit) };
};

export const getPublishedBookingProductById = async (productId: string) => {
  const product = await BookingProduct.findOne({ _id: productId, isPublished: true });
  if (!product) throw new AppError('Booking product not found', 404);
  return withOnlyAvailableDates(product);
};

// ─────────────────────────────────────────────────────────────────────────────
// User — book a session
//
// Atomic reserve: the update only succeeds if the target date is still
// present and unbooked, so two concurrent bookings for the same date can't
// both win.
// ─────────────────────────────────────────────────────────────────────────────

export const bookSession = async (
  productId: string,
  input: BookSessionInput,
  userId: Types.ObjectId,
) => {
  const [product, user] = await Promise.all([
    BookingProduct.findOne({ _id: productId, isPublished: true }),
    User.findById(userId),
  ]);
  if (!product) throw new AppError('Booking product not found', 404);
  if (!user) throw new AppError('User not found', 404);

  if (!product.availableTimes.includes(input.time)) {
    throw new AppError('That time is not offered for this session', 400);
  }

  const day = toDayStart(input.date);

  const reserved = await BookingProduct.findOneAndUpdate(
    { _id: productId, availableDates: { $elemMatch: { date: day, isBooked: false } } },
    { $set: { 'availableDates.$.isBooked': true } },
  );

  if (!reserved) {
    const dateExists = product.availableDates.some((d) => d.date.getTime() === day.getTime());
    throw new AppError(
      dateExists ? 'That date has already been booked' : 'That date is not available',
      dateExists ? 409 : 404,
    );
  }

  const booking = await SessionBooking.create({
    productId,
    userId,
    date: day,
    time: input.time,
  });

  sendBookingNotificationEmail({
    productTitle: product.title,
    date: day,
    time: input.time,
    bookedByName: user.fullName,
    bookedByEmail: user.email,
  }).catch((err) => console.error('Booking notification email failed:', err));

  return booking;
};
