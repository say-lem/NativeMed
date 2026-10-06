import { Types } from 'mongoose';
import type Stripe from 'stripe';
import { env } from '../../../config/env';
import { stripe } from '../../../config/stripe';
import cloudinary, { CloudinaryFolders, uploadBuffer } from '../../../config/cloudinary';
import { AppError } from '../../../shared/utils/appError';
import { User } from '../../auth/model/auth.model';
import {
  BookingProduct,
  ISessionBooking,
  PENDING_BOOKING_TTL_MS,
  SessionBooking,
  SlotAvailabilityRequest,
} from '../model/booking.model';
import { sendBookingNotificationEmail, sendSlotAvailabilityRequestEmail } from '../email/booking.email.service';
import {
  CreateBookingProductInput,
  UpdateBookingProductInput,
  AddAvailableDateInput,
  BookSessionInput,
  RequestSlotAvailabilityInput,
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

// Destroy-then-upload, same ordering rationale as Course.updateCourseThumbnail —
// if the new upload fails, the old image is already gone but no bad data has
// been written.
export const updateBookingProductImage = async (productId: string, file: Express.Multer.File) => {
  const existing = await BookingProduct.findById(productId).select('+imagePublicId');
  if (!existing) throw new AppError('Booking product not found', 404);

  if (existing.imagePublicId) {
    try {
      await cloudinary.uploader.destroy(existing.imagePublicId, { resource_type: 'image' });
    } catch (err) {
      console.error(`⚠️  Could not delete old booking product image (${existing.imagePublicId}):`, err);
    }
  }

  const result = await uploadBuffer(file.buffer, {
    folder: CloudinaryFolders.BOOKING_IMAGES,
    resource_type: 'image',
    use_filename: false,
    unique_filename: true,
    overwrite: false,
    // `limit` only ever scales down, never crops — nothing the admin uploaded is lost.
    transformation: [{ width: 1600, height: 1600, crop: 'limit' }],
  });

  const updated = await BookingProduct.findByIdAndUpdate(
    productId,
    { imageUrl: result.secure_url, imagePublicId: result.public_id },
    { new: true },
  );

  if (!updated) throw new AppError('Booking product not found', 404);
  return updated;
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

  product.availableDates.push({ date: day, bookedTimes: [] });
  await product.save();

  return product;
};

export const removeAvailableDate = async (productId: string, dateId: string) => {
  const product = await BookingProduct.findById(productId);
  if (!product) throw new AppError('Booking product not found', 404);

  const entry = product.availableDates.id(dateId);
  if (!entry) throw new AppError('Date not found', 404);
  if (entry.bookedTimes.length > 0) {
    throw new AppError('Cannot remove a date that already has bookings', 400);
  }

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

export const getAllSlotAvailabilityRequests = async (page = 1, limit = 20) => {
  const [items, total] = await Promise.all([
    SlotAvailabilityRequest.find()
      .populate('productId', 'title')
      .populate('userId', 'fullName email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    SlotAvailabilityRequest.countDocuments(),
  ]);
  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
};

export const resolveSlotAvailabilityRequest = async (requestId: string) => {
  const request = await SlotAvailabilityRequest.findByIdAndUpdate(
    requestId,
    { status: 'resolved' },
    { new: true },
  );
  if (!request) throw new AppError('Slot availability request not found', 404);
  return request;
};

export const deleteSlotAvailabilityRequest = async (requestId: string): Promise<void> => {
  const request = await SlotAvailabilityRequest.findByIdAndDelete(requestId);
  if (!request) throw new AppError('Slot availability request not found', 404);
};

// ─────────────────────────────────────────────────────────────────────────────
// Public — published products. Each date lists every one of the product's
// availableTimes with an isAvailable flag, so the frontend can render the
// full set of time buttons and disable the ones already taken rather than
// just shrinking the list. A date disappears entirely only once every time
// on it has been booked (nothing left to offer, disabled or not).
// ─────────────────────────────────────────────────────────────────────────────

// Same "is this (date, time) still bookable" logic as withOnlyAvailableDates
// below, without the JSON round-trip — used to gate requestSlotAvailability().
const hasAnyOpenSlot = (product: InstanceType<typeof BookingProduct>): boolean =>
  product.availableDates.some((d) => product.availableTimes.some((t) => !d.bookedTimes.includes(t)));

const withOnlyAvailableDates = (product: InstanceType<typeof BookingProduct>) => {
  const json = product.toJSON() as unknown as Record<string, unknown> & {
    availableTimes: string[];
    availableDates: { _id: unknown; date: Date; bookedTimes: string[] }[];
  };
  const allTimes = json.availableTimes;
  const availableDates = json.availableDates
    .map((d) => ({
      _id: d._id,
      date: d.date,
      times: allTimes.map((time) => ({ time, isAvailable: !d.bookedTimes.includes(time) })),
    }))
    .filter((d) => d.times.some((t) => t.isAvailable));

  return { ...json, availableDates };
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

export const getMyBookings = async (userId: Types.ObjectId, page = 1, limit = 20) => {
  const filter = { userId };
  const [items, total] = await Promise.all([
    SessionBooking.find(filter)
      .populate('productId', 'title description price')
      .sort({ date: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    SessionBooking.countDocuments(filter),
  ]);
  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
};

// Releases a held slot back into the pool — used both when checkout setup
// fails synchronously and when a checkout session expires unpaid.
const releaseSlot = async (productId: Types.ObjectId | string, date: Date, time: string): Promise<void> => {
  await BookingProduct.updateOne(
    { _id: productId, 'availableDates.date': date },
    { $pull: { 'availableDates.$.bookedTimes': time } },
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// User — start a booking checkout
//
// The slot is reserved atomically up front (same guarantee as before: two
// concurrent requests for the same (date, time) can't both win) so a second
// user can't even start paying for a slot someone else is already mid-checkout
// on. The booking itself stays `pending` — and unconfirmed slots are never
// shown as booked to anyone except by being absent from availability — until
// Stripe confirms payment via webhook (see confirmBookingPayment below). If
// checkout is abandoned and the session expires, releasePendingBooking()
// frees the slot back up.
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

  const unitAmount = Math.round(product.price * 100);
  if (!Number.isFinite(unitAmount) || unitAmount < 50) {
    throw new AppError('This session does not have a valid purchase price', 400);
  }

  const day = toDayStart(input.date);

  const reserved = await BookingProduct.findOneAndUpdate(
    { _id: productId, availableDates: { $elemMatch: { date: day, bookedTimes: { $ne: input.time } } } },
    { $push: { 'availableDates.$.bookedTimes': input.time } },
  );

  if (!reserved) {
    const dateEntry = product.availableDates.find((d) => d.date.getTime() === day.getTime());
    if (!dateEntry) {
      throw new AppError('That date is not available', 404);
    }
    throw new AppError('That time slot has already been booked', 409);
  }

  const booking = await SessionBooking.create({
    productId,
    userId,
    date: day,
    time: input.time,
    status: 'pending',
  });

  const successUrl = input.successUrl ?? `${env.CLIENT_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = input.cancelUrl ?? `${env.CLIENT_URL}/payment/cancelled`;

  // Mirrors PENDING_BOOKING_TTL_MS so Stripe's own session expiry lines up
  // with the hold our sweep/webhook release on — the countdown the frontend
  // renders and the window in which the checkout link actually works agree.
  const paymentInitiatedAt = booking.createdAt;
  const expiresAt = new Date(paymentInitiatedAt.getTime() + PENDING_BOOKING_TTL_MS);

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: user.email,
      expires_at: Math.floor(expiresAt.getTime() / 1000),
      line_items: [
        {
          price_data: {
            currency: 'gbp',
            unit_amount: unitAmount,
            product_data: {
              name: `${product.title} — one-on-one session`,
              metadata: { productId: product._id.toString() },
            },
          },
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        type: 'booking',
        bookingId: booking._id.toString(),
        productId: product._id.toString(),
        userId: userId.toString(),
      },
    });

    booking.stripeCheckoutSessionId = session.id;
    await booking.save();

    return { bookingId: booking._id, sessionId: session.id, url: session.url, paymentInitiatedAt, expiresAt };
  } catch (err) {
    // Checkout never started — release the hold rather than leaving a dead
    // reservation behind.
    await releaseSlot(productId, day, input.time);
    await booking.deleteOne();
    throw err;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// User — reach out about a session with no open slot. Only accepted when the
// product genuinely has nothing bookable right now, so the data stays
// meaningful and the endpoint can't be used as a generic contact form.
// ─────────────────────────────────────────────────────────────────────────────

export const requestSlotAvailability = async (
  productId: string,
  input: RequestSlotAvailabilityInput,
  userId: Types.ObjectId,
) => {
  const product = await BookingProduct.findOne({ _id: productId, isPublished: true });
  if (!product) throw new AppError('Booking product not found', 404);

  if (hasAnyOpenSlot(product)) {
    throw new AppError('This session currently has open slots — please book one directly instead', 400);
  }

  const request = await SlotAvailabilityRequest.create({
    productId,
    userId,
    name: input.name,
    email: input.email,
    examSitting: input.examSitting,
    preferredDates: input.preferredDates,
  });

  sendSlotAvailabilityRequestEmail({
    productTitle: product.title,
    name: input.name,
    email: input.email,
    examSitting: input.examSitting,
    preferredDates: input.preferredDates,
  }).catch((err) => console.error('Slot availability request email failed:', err));

  return request;
};

// ─────────────────────────────────────────────────────────────────────────────
// Called from the Stripe webhook (payments.service.ts) once a booking's
// checkout session completes successfully.
// ─────────────────────────────────────────────────────────────────────────────

export const confirmBookingPayment = async (
  session: Stripe.Checkout.Session,
): Promise<ISessionBooking | null> => {
  const bookingId = session.metadata?.bookingId;
  if (!bookingId) return null;

  const booking = await SessionBooking.findById(bookingId);
  if (!booking || booking.status !== 'pending') return booking;

  booking.status = 'confirmed';
  await booking.save();

  const [product, user] = await Promise.all([
    BookingProduct.findById(booking.productId),
    User.findById(booking.userId),
  ]);

  if (product && user) {
    sendBookingNotificationEmail({
      productTitle: product.title,
      date: booking.date,
      time: booking.time,
      bookedByName: user.fullName,
      bookedByEmail: user.email,
    }).catch((err) => console.error('Booking notification email failed:', err));
  }

  return booking;
};

// ─────────────────────────────────────────────────────────────────────────────
// Called from the Stripe webhook when a booking's checkout session expires
// unpaid — releases the held slot and marks the booking cancelled.
// ─────────────────────────────────────────────────────────────────────────────

export const releasePendingBooking = async (session: Stripe.Checkout.Session): Promise<void> => {
  const bookingId = session.metadata?.bookingId;
  if (!bookingId) return;

  const booking = await SessionBooking.findById(bookingId);
  if (!booking || booking.status !== 'pending') return;

  await releaseSlot(booking.productId, booking.date, booking.time);

  booking.status = 'cancelled';
  await booking.save();
};

// ─────────────────────────────────────────────────────────────────────────────
// User — resume paying for a booking they started but didn't finish (closed
// the tab, hit back, etc.). Returns the same Stripe checkout session's URL
// rather than minting a new one, as long as the hour-long payment window
// (and Stripe's matching session expiry) hasn't passed yet.
// ─────────────────────────────────────────────────────────────────────────────

export const resumeBookingPayment = async (bookingId: string, userId: Types.ObjectId) => {
  const booking = await SessionBooking.findById(bookingId);
  if (!booking || !booking.userId.equals(userId)) {
    throw new AppError('Booking not found', 404);
  }
  if (booking.status !== 'pending') {
    throw new AppError('This booking is no longer awaiting payment', 400);
  }
  if (!booking.stripeCheckoutSessionId) {
    throw new AppError('No checkout session exists for this booking', 400);
  }

  const paymentInitiatedAt = booking.createdAt;
  const expiresAt = new Date(paymentInitiatedAt.getTime() + PENDING_BOOKING_TTL_MS);
  if (Date.now() >= expiresAt.getTime()) {
    throw new AppError('The payment window for this booking has expired', 410);
  }

  const session = await stripe.checkout.sessions.retrieve(booking.stripeCheckoutSessionId);
  if (!session.url || session.status !== 'open') {
    throw new AppError('The payment window for this booking has expired', 410);
  }

  return { bookingId: booking._id, sessionId: session.id, url: session.url, paymentInitiatedAt, expiresAt };
};

// ─────────────────────────────────────────────────────────────────────────────
// Scheduled sweep (see server.ts) — safety net for bookings stuck in
// `pending` past an hour. Stripe's checkout.session.expired webhook is the
// normal way a stale booking gets cleared (see releasePendingBooking above),
// but if that webhook is ever missed or delayed, this catches it: the slot
// is released and the booking itself is removed outright, rather than kept
// around as `cancelled`.
// ─────────────────────────────────────────────────────────────────────────────

export const releaseExpiredPendingBookings = async (): Promise<number> => {
  const cutoff = new Date(Date.now() - PENDING_BOOKING_TTL_MS);
  const expired = await SessionBooking.find({ status: 'pending', createdAt: { $lt: cutoff } });

  for (const booking of expired) {
    await releaseSlot(booking.productId, booking.date, booking.time);
    await booking.deleteOne();
  }

  return expired.length;
};
