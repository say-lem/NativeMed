import { z } from 'zod';

const timeField = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be in 24-hour HH:mm format');

// Month/year the user intends to sit the exam, e.g. "03/26" — same format as
// User.examSitting (see auth/schema/auth.schema.ts).
const examSittingField = z
  .string()
  .trim()
  .regex(/^(0[1-9]|1[0-2])\/\d{2}$/, 'examSitting must be in MM/YY format');

export const createBookingProductSchema = z.object({
  title:          z.string().trim().min(2, 'Title is required').max(200),
  description:    z.string().trim().min(5, 'Description must be at least 5 characters').max(2000),
  detailedDescription: z.string().trim().min(10, 'Detailed description must be at least 10 characters').max(20000).optional(),
  price:          z.number().min(0, 'Price cannot be negative'),
  availableTimes: z.array(timeField).default([]),
  isPublished:    z.boolean().optional(),
});

export type CreateBookingProductInput = z.infer<typeof createBookingProductSchema>;

export const updateBookingProductSchema = createBookingProductSchema.partial()
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided' });

export type UpdateBookingProductInput = z.infer<typeof updateBookingProductSchema>;

export const addAvailableDateSchema = z.object({
  date: z.coerce.date({ message: 'A valid date is required' }),
});

export type AddAvailableDateInput = z.infer<typeof addAvailableDateSchema>;

export const bookSessionSchema = z.object({
  date: z.coerce.date({ message: 'A valid date is required' }),
  time: timeField,
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});

export type BookSessionInput = z.infer<typeof bookSessionSchema>;

export const requestSlotAvailabilitySchema = z.object({
  name:           z.string().trim().min(2, 'Name is required').max(200),
  email:          z.string().trim().email('Invalid email address').max(254),
  examSitting:    examSittingField,
  preferredDates: z
    .array(z.coerce.date({ message: 'A valid date is required' }))
    .min(1, 'At least one preferred date is required')
    .max(10, 'No more than 10 preferred dates'),
});

export type RequestSlotAvailabilityInput = z.infer<typeof requestSlotAvailabilitySchema>;
