import { Router } from 'express';
import { authenticate } from '../../../shared/middleware/authenticate';
import { validate } from '../../../shared/middleware/validate';
import { bookSessionSchema, requestSlotAvailabilitySchema } from '../schema/booking.schema';
import * as bookingController from '../controller/booking.controller';

const router = Router();

// Open — published booking products, with only still-available dates shown
router.get('/', bookingController.getPublishedBookingProducts);

// Static path before /:productId — a logged-in user's own bookings
router.get('/me', authenticate, bookingController.getMyBookings);

router.get('/:productId', bookingController.getPublishedBookingProductById);

// Booking a session requires a logged-in user — the admin needs to know who booked
router.post(
  '/:productId/book',
  authenticate,
  validate(bookSessionSchema),
  bookingController.bookSession,
);

// Resume paying for a booking that's still within its hour-long payment
// window — returns the same Stripe checkout session rather than a new one.
// Two segments, so this never collides with the single-segment GET /:productId.
router.get('/:bookingId/resume-payment', authenticate, bookingController.resumeBookingPayment);

// Reach out about a session with no open slot — only accepted when the
// product genuinely has nothing bookable right now (see booking.service.ts).
router.post(
  '/:productId/request-slot',
  authenticate,
  validate(requestSlotAvailabilitySchema),
  bookingController.requestSlotAvailability,
);

export default router;
