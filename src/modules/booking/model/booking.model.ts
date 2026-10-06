import { Schema, model, Document, Types } from 'mongoose';

export interface IAvailableDate {
  _id: Types.ObjectId;
  date: Date;
  // Times (from the product's availableTimes) already taken on this date.
  // The date itself is only fully unavailable once every time is booked —
  // see withOnlyAvailableDates() in the service.
  bookedTimes: string[];
}

export interface IBookingProduct extends Document {
  _id: Types.ObjectId;
  title: string;
  description: string;
  // Longer-form write-up shown on the session's detail page — `description`
  // stays the short summary used in listings/cards.
  detailedDescription?: string;
  imageUrl?: string;
  imagePublicId?: string; // select:false — Cloudinary ref, used only for replace/delete
  price: number;
  // Reusable time-of-day options offered on every available date. Each
  // (date, time) pair is booked independently — see IAvailableDate.bookedTimes.
  availableTimes: string[];
  availableDates: Types.DocumentArray<IAvailableDate>;
  isPublished: boolean;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const availableDateSchema = new Schema<IAvailableDate>(
  {
    date:        { type: Date, required: true },
    bookedTimes: { type: [String], default: [] },
  },
  { _id: true },
);

const bookingProductSchema = new Schema<IBookingProduct>(
  {
    title:          { type: String, required: true, trim: true, maxlength: 200 },
    description:    { type: String, required: true, trim: true, maxlength: 2000 },
    detailedDescription: { type: String, trim: true, maxlength: 20000 },
    imageUrl:       { type: String },
    imagePublicId:  { type: String, select: false },
    price:          { type: Number, required: true, min: 0 },
    availableTimes: {
      type: [String],
      default: [],
      validate: {
        validator: (times: string[]) => times.every((t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t)),
        message: 'availableTimes must be in 24-hour HH:mm format',
      },
    },
    availableDates: { type: [availableDateSchema], default: [] },
    isPublished:    { type: Boolean, default: true },
    createdBy:      { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

bookingProductSchema.index({ isPublished: 1 });

// imagePublicId is an internal Cloudinary ref — never sent to clients, same
// pattern as Course.thumbnailPublicId.
bookingProductSchema.set('toJSON', {
  transform: (_doc, ret) => {
    const safeRet = ret as unknown as Record<string, unknown>;
    delete safeRet.imagePublicId;
    delete safeRet.__v;
    return safeRet;
  },
});

export const BookingProduct = model<IBookingProduct>('BookingProduct', bookingProductSchema);

// ─────────────────────────────────────────────────────────────────────────────
// SessionBooking — one (date, time) slot on a BookingProduct, held for a
// user. Source of truth for "who booked what"; availableDates.bookedTimes is
// the fast path for checking/reserving availability without joining this
// collection.
//
// The slot is reserved (bookedTimes updated) the moment checkout starts, so
// a second user can't also attempt to pay for it — but the booking itself
// is only `confirmed` once Stripe confirms payment (see payments.service.ts's
// webhook handling). If checkout expires unpaid, it's marked `cancelled` and
// the slot is released back into the pool.
// ─────────────────────────────────────────────────────────────────────────────

// A pending booking's checkout session (and its held slot) is only good for
// an hour — see releaseExpiredPendingBookings() in the service and the
// `expires_at` set on the Stripe checkout session in bookSession(). Shared
// here so the computed `paymentExpiresAt` below (toJSON) and the service's
// expiry checks always agree.
export const PENDING_BOOKING_TTL_MS = 60 * 60 * 1000;

export type SessionBookingStatus = 'pending' | 'confirmed' | 'cancelled';

export interface ISessionBooking extends Document {
  _id: Types.ObjectId;
  productId: Types.ObjectId;
  userId: Types.ObjectId;
  date: Date;
  time: string;
  status: SessionBookingStatus;
  stripeCheckoutSessionId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const sessionBookingSchema = new Schema<ISessionBooking>(
  {
    productId:               { type: Schema.Types.ObjectId, ref: 'BookingProduct', required: true },
    userId:                  { type: Schema.Types.ObjectId, ref: 'User', required: true },
    date:                    { type: Date, required: true },
    time:                    { type: String, required: true, trim: true },
    status:                  { type: String, enum: ['pending', 'confirmed', 'cancelled'], default: 'pending' },
    stripeCheckoutSessionId: { type: String },
  },
  { timestamps: true },
);

// Admin booking list, newest first; per-product lookups
sessionBookingSchema.index({ createdAt: -1 });
sessionBookingSchema.index({ productId: 1 });
sessionBookingSchema.index({ stripeCheckoutSessionId: 1 }, { sparse: true, unique: true });

// Exposes when a pending booking's payment window closes, derived from
// `createdAt` rather than stored, so the frontend can render a countdown
// (and know when to offer "resume payment") without a second field to keep
// in sync.
sessionBookingSchema.set('toJSON', {
  transform: (_doc, ret) => {
    const safeRet = ret as unknown as Record<string, unknown> & { status: SessionBookingStatus; createdAt: Date };
    if (safeRet.status === 'pending') {
      safeRet.paymentInitiatedAt = safeRet.createdAt;
      safeRet.paymentExpiresAt = new Date(safeRet.createdAt.getTime() + PENDING_BOOKING_TTL_MS);
    }
    delete safeRet.__v;
    return safeRet;
  },
});

export const SessionBooking = model<ISessionBooking>('SessionBooking', sessionBookingSchema);

// ─────────────────────────────────────────────────────────────────────────────
// SlotAvailabilityRequest — a user reaching out about a BookingProduct that
// currently has no open (date, time) slot to book. Lets the admin follow up
// once a new date is added, without the user having to keep checking back.
// Only acceptable when the product genuinely has no open slot — enforced in
// booking.service.ts's requestSlotAvailability().
// ─────────────────────────────────────────────────────────────────────────────

export type SlotRequestStatus = 'pending' | 'resolved';

export interface ISlotAvailabilityRequest extends Document {
  _id: Types.ObjectId;
  productId: Types.ObjectId;
  userId: Types.ObjectId;
  name: string;
  email: string;
  examSitting: string;
  preferredDates: Date[];
  status: SlotRequestStatus;
  createdAt: Date;
  updatedAt: Date;
}

const slotAvailabilityRequestSchema = new Schema<ISlotAvailabilityRequest>(
  {
    productId:      { type: Schema.Types.ObjectId, ref: 'BookingProduct', required: true },
    userId:         { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name:           { type: String, required: true, trim: true, maxlength: 200 },
    email:          { type: String, required: true, trim: true, lowercase: true },
    examSitting:    { type: String, required: true, trim: true },
    preferredDates: {
      type: [Date],
      required: true,
      validate: {
        validator: (dates: Date[]) => dates.length > 0,
        message: 'At least one preferred date is required',
      },
    },
    status: { type: String, enum: ['pending', 'resolved'], default: 'pending' },
  },
  { timestamps: true },
);

// Admin list, newest first; per-product lookups
slotAvailabilityRequestSchema.index({ createdAt: -1 });
slotAvailabilityRequestSchema.index({ productId: 1 });

export const SlotAvailabilityRequest = model<ISlotAvailabilityRequest>(
  'SlotAvailabilityRequest',
  slotAvailabilityRequestSchema,
);
