import { Request, Response } from 'express';
import { asyncHandler } from '../../../shared/middleware/asyncHandler';
import { ApiResponse } from '../../../shared/utils/apiResponse';
import { AuthRequest } from '../../../shared/types';
import {
  CreateBookingProductInput,
  UpdateBookingProductInput,
  AddAvailableDateInput,
  BookSessionInput,
} from '../schema/booking.schema';
import * as bookingService from '../service/booking.service';

const getSingleParam = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? value[0] : (value ?? '');

// ─────────────────────────────────────────────────────────────────────────────
// Public
// ─────────────────────────────────────────────────────────────────────────────

export const getPublishedBookingProducts = asyncHandler(async (req: Request, res: Response) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;
  const result = await bookingService.getPublishedBookingProducts(page, limit);
  return ApiResponse.success(res, 'Booking products fetched', result);
});

export const getPublishedBookingProductById = asyncHandler(async (req: Request, res: Response) => {
  const product = await bookingService.getPublishedBookingProductById(getSingleParam(req.params.productId));
  return ApiResponse.success(res, 'Booking product fetched', product);
});

// ─────────────────────────────────────────────────────────────────────────────
// User — book a session
// ─────────────────────────────────────────────────────────────────────────────

export const bookSession = asyncHandler(async (req: AuthRequest, res: Response) => {
  const input = req.body as BookSessionInput;
  const booking = await bookingService.bookSession(getSingleParam(req.params.productId), input, req.user!._id);
  return ApiResponse.created(res, 'Session booked', booking);
});

export const getMyBookings = asyncHandler(async (req: AuthRequest, res: Response) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;
  const result = await bookingService.getMyBookings(req.user!._id, page, limit);
  return ApiResponse.success(res, 'Bookings fetched', result);
});

// ─────────────────────────────────────────────────────────────────────────────
// Admin
// ─────────────────────────────────────────────────────────────────────────────

export const createBookingProduct = asyncHandler(async (req: AuthRequest, res: Response) => {
  const input = req.body as CreateBookingProductInput;
  const product = await bookingService.createBookingProduct(input, req.user!._id);
  return ApiResponse.created(res, 'Booking product created', product);
});

export const getAllBookingProducts = asyncHandler(async (req: Request, res: Response) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;
  const result = await bookingService.getAllBookingProducts(page, limit);
  return ApiResponse.success(res, 'Booking products fetched', result);
});

export const updateBookingProduct = asyncHandler(async (req: Request, res: Response) => {
  const input = req.body as UpdateBookingProductInput;
  const product = await bookingService.updateBookingProduct(getSingleParam(req.params.productId), input);
  return ApiResponse.success(res, 'Booking product updated', product);
});

export const publishBookingProduct = asyncHandler(async (req: Request, res: Response) => {
  const product = await bookingService.setBookingProductPublished(getSingleParam(req.params.productId), true);
  return ApiResponse.success(res, 'Booking product published', product);
});

export const unpublishBookingProduct = asyncHandler(async (req: Request, res: Response) => {
  const product = await bookingService.setBookingProductPublished(getSingleParam(req.params.productId), false);
  return ApiResponse.success(res, 'Booking product unpublished', product);
});

export const deleteBookingProduct = asyncHandler(async (req: Request, res: Response) => {
  await bookingService.deleteBookingProduct(getSingleParam(req.params.productId));
  return ApiResponse.success(res, 'Booking product deleted');
});

export const addAvailableDate = asyncHandler(async (req: Request, res: Response) => {
  const input = req.body as AddAvailableDateInput;
  const product = await bookingService.addAvailableDate(getSingleParam(req.params.productId), input);
  return ApiResponse.created(res, 'Available date added', product);
});

export const removeAvailableDate = asyncHandler(async (req: Request, res: Response) => {
  const product = await bookingService.removeAvailableDate(
    getSingleParam(req.params.productId),
    getSingleParam(req.params.dateId),
  );
  return ApiResponse.success(res, 'Available date removed', product);
});

export const getAllBookings = asyncHandler(async (req: Request, res: Response) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;
  const result = await bookingService.getAllBookings(page, limit);
  return ApiResponse.success(res, 'Bookings fetched', result);
});
