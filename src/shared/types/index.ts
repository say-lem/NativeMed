import { Request } from 'express';
import { Types } from 'mongoose';

// ── User roles ────────────────────────────────────────────────────────────────
export type UserRole = 'user' | 'admin';

// ── Augment Express Request so controllers get typed user after auth ──────────
export interface AuthRequest extends Request {
  user?: {
    _id: Types.ObjectId;
    email: string;
    role: UserRole;
  };
}

// ── Standard API response shape ───────────────────────────────────────────────
export interface ApiResponseBody<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  errors?: unknown;
}

// ── Pagination ────────────────────────────────────────────────────────────────
export interface PaginationQuery {
  page?: number;
  limit?: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ── Content types ─────────────────────────────────────────────────────────────
export type ContentType = 'video' | 'audio' | 'pdf';

// ── Payment item types ────────────────────────────────────────────────────────
export type PaymentItemType = 'course' | 'subscription';

// ── Payment methods ───────────────────────────────────────────────────────────
export type PaymentMethod = 'stripe' | 'paypal';

// ── Payment / subscription statuses ──────────────────────────────────────────
export type PaymentStatus = 'pending' | 'succeeded' | 'failed' | 'refunded';
export type SubscriptionStatus = 'active' | 'expired' | 'cancelled' | 'past_due';

// ── Difficulty levels ─────────────────────────────────────────────────────────
export type DifficultyLevel = 'easy' | 'medium' | 'hard';