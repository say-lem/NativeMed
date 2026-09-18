import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';

import { env } from './config/env';
import { errorHandler } from './shared/middleware/errorHandler';
import { createLeakyBucketLimiter } from './shared/middleware/leakyBucket';

import authRoutes from './modules/auth/routes/auth.route';
import coursesRoutes from './modules/courses/routes/courses.routes';
import liveCoursesRoutes from './modules/liveCourses/routes/liveCourses.routes';
import casesRoutes from './modules/cases/routes/cases.route';
import { createContentRouter } from './modules/content/routes/content.route';
import enrollmentsRoutes from './modules/enrollments/routes/enrollments.routes';
import adminRoutes from './modules/enrollments/routes/admin.routes';
import paymentsRoutes from './modules/payments/routes/payments.routes';
import paymentsWebhookRoutes from './modules/payments/routes/webhook.routes';
import subscriptionsRoutes from './modules/subscriptions/routes/subscriptions.routes';
import contactRoutes from './modules/contact/routes/contact.route';
import reviewsRoutes from './modules/reviews/routes/reviews.route';
import reviewsAdminRoutes from './modules/reviews/routes/admin.routes';
import activitiesRoutes from './modules/activities/routes/activities.route';
import activitiesAdminRoutes from './modules/activities/routes/admin.routes';
import homepageRoutes from './modules/homepage/routes/homepage.route';
import homepageAdminRoutes from './modules/homepage/routes/admin.routes';
import freeProductsRoutes from './modules/freeProducts/routes/freeProducts.route';
import freeProductsAdminRoutes from './modules/freeProducts/routes/admin.routes';
import bookingRoutes from './modules/booking/routes/booking.route';
import bookingAdminRoutes from './modules/booking/routes/admin.routes';
import catalogRoutes from './modules/catalog/routes/catalog.route';

const app = express();

app.set('trust proxy', 1); // Trust Render's proxy for accurate IP detection

// ── Security headers
app.use(helmet());

// ── CORS 
app.use(
  cors({
    origin: env.CLIENT_URL,
    credentials: true,
  }),
);

// ── Rate limiting — leaky bucket (meter) ─────────────────────────────────────
// Continuously-draining bucket per client, not a fixed window: capacity is
// the burst allowance, windowMs is how long a full bucket takes to drain.
// See shared/middleware/leakyBucket.ts for why this replaced express-rate-limit.
const makeLimiter = (capacity: number, message: string) =>
  createLeakyBucketLimiter({ capacity, windowMs: 15 * 60 * 1000, message });

const authLimiter = makeLimiter(20, 'Too many login attempts, please try again later.');
const adminLimiter = makeLimiter(60, 'Too many admin requests, please try again later.');
const paymentsLimiter = makeLimiter(80, 'Too many payment requests, please try again later.');
const contentLimiter = makeLimiter(150, 'Too many requests, please try again later.');
const generalLimiter = makeLimiter(200, 'Too many requests, please try again later.');
const healthLimiter = makeLimiter(600, 'Too many health checks, please try again later.');

const API = '/api/v1';

// ── Stripe webhook (must use raw body, before JSON parser) ───────────────────
app.use(`${API}/payments/webhook`, paymentsLimiter, express.raw({ type: 'application/json' }), paymentsWebhookRoutes);

// ── Body parsing 
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ── Request logging 
if (env.NODE_ENV !== 'test') {
  app.use(morgan(env.NODE_ENV === 'development' ? 'dev' : 'combined'));
}

// ── Health check 
app.get('/health', healthLimiter, (_req, res) => {
  res.json({ success: true, message: 'Native Med API is running', env: env.NODE_ENV });
});

// ── API routes 

app.use(`${API}/auth`, authLimiter, authRoutes);
app.use(`${API}/courses`, contentLimiter, coursesRoutes);
app.use(`${API}/courses/:courseId/content`, contentLimiter, createContentRouter('Course')); // nested: /courses/:id/content
app.use(`${API}/live-courses`, contentLimiter, liveCoursesRoutes);
app.use(`${API}/live-courses/:courseId/content`, contentLimiter, createContentRouter('LiveCourse')); // nested: /live-courses/:id/content
app.use(`${API}/enrollments`, contentLimiter, enrollmentsRoutes);
app.use(`${API}/payments`, paymentsLimiter, paymentsRoutes);
app.use(`${API}/subscriptions`, paymentsLimiter, subscriptionsRoutes);
app.use(`${API}/admin`, adminLimiter, adminRoutes);
app.use(`${API}/cases`, generalLimiter, casesRoutes);
// Contact form is throttled internally via a leaky-bucket queue (see contact module) —
// submissions are shaped/smoothed, not just rejected outright, since the endpoint's
// sole job is dispatching an email.
app.use(`${API}/contact`, contactRoutes);
app.use(`${API}/reviews`, generalLimiter, reviewsRoutes);
app.use(`${API}/admin/reviews`, adminLimiter, reviewsAdminRoutes);
app.use(`${API}/activities`, generalLimiter, activitiesRoutes);
app.use(`${API}/admin/activities`, adminLimiter, activitiesAdminRoutes);
app.use(`${API}/homepage`, generalLimiter, homepageRoutes);
app.use(`${API}/admin/homepage`, adminLimiter, homepageAdminRoutes);
app.use(`${API}/free-products`, generalLimiter, freeProductsRoutes);
app.use(`${API}/admin/free-products`, adminLimiter, freeProductsAdminRoutes);
app.use(`${API}/booking`, generalLimiter, bookingRoutes);
app.use(`${API}/admin/booking`, adminLimiter, bookingAdminRoutes);
app.use(`${API}/products`, generalLimiter, catalogRoutes);

// ── 404 handler 
app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// ── Global error handler 
app.use(errorHandler);

export default app;