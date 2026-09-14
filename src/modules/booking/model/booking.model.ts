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
// SessionBooking — a completed booking of one (date, time) slot on a
// BookingProduct. Source of truth for "who booked what"; availableDates.
// bookedTimes is the fast path for checking/reserving availability without
// joining this collection.
// ─────────────────────────────────────────────────────────────────────────────

export interface ISessionBooking extends Document {
  _id: Types.ObjectId;
  productId: Types.ObjectId;
  userId: Types.ObjectId;
  date: Date;
  time: string;
  createdAt: Date;
  updatedAt: Date;
}

const sessionBookingSchema = new Schema<ISessionBooking>(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'BookingProduct', required: true },
    userId:    { type: Schema.Types.ObjectId, ref: 'User', required: true },
    date:      { type: Date, required: true },
    time:      { type: String, required: true, trim: true },
  },
  { timestamps: true },
);

// Admin booking list, newest first; per-product lookups
sessionBookingSchema.index({ createdAt: -1 });
sessionBookingSchema.index({ productId: 1 });

export const SessionBooking = model<ISessionBooking>('SessionBooking', sessionBookingSchema);
