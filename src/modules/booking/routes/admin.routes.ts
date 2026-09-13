import { Router } from 'express';
import { authenticate } from '../../../shared/middleware/authenticate';
import { authorize } from '../../../shared/middleware/authorize';
import { validate } from '../../../shared/middleware/validate';
import {
  createBookingProductSchema,
  updateBookingProductSchema,
  addAvailableDateSchema,
} from '../schema/booking.schema';
import * as bookingController from '../controller/booking.controller';

const router = Router();
router.use(authenticate, authorize('admin'));

router.get('/products', bookingController.getAllBookingProducts);
router.post('/products', validate(createBookingProductSchema), bookingController.createBookingProduct);
router.patch('/products/:productId', validate(updateBookingProductSchema), bookingController.updateBookingProduct);
router.patch('/products/:productId/publish', bookingController.publishBookingProduct);
router.patch('/products/:productId/unpublish', bookingController.unpublishBookingProduct);
router.patch('/products/:productId/archive', bookingController.unpublishBookingProduct);
router.delete('/products/:productId', bookingController.deleteBookingProduct);

// Available dates on a product
router.post(
  '/products/:productId/dates',
  validate(addAvailableDateSchema),
  bookingController.addAvailableDate,
);
router.delete('/products/:productId/dates/:dateId', bookingController.removeAvailableDate);

// All bookings across every product
router.get('/bookings', bookingController.getAllBookings);

export default router;
