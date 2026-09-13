import { z } from 'zod';

const timeField = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be in 24-hour HH:mm format');

export const createBookingProductSchema = z.object({
  title:          z.string().trim().min(2, 'Title is required').max(200),
  description:    z.string().trim().min(5, 'Description must be at least 5 characters').max(2000),
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
});

export type BookSessionInput = z.infer<typeof bookSessionSchema>;
