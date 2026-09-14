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

export const SessionBooking = model<ISessionBooking>('SessionBooking', sessionBookingSchema);
