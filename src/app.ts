import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';

import { env } from './config/env';
import { errorHandler } from './shared/middleware/errorHandler';

import authRoutes from './modules/auth/routes/auth.route';
import coursesRoutes from './modules/courses/routes/courses.routes';
import casesRoutes from './modules/cases/routes/cases.route';
import contentRoutes from './modules/content/routes/content.route';
import enrollmentsRoutes from './modules/enrollments/routes/enrollments.routes';
import adminRoutes from './modules/enrollments/routes/admin.routes';

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

// ── Rate limiting 
const makeLimiter = (max: number, message: string) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message },
  });

const authLimiter = makeLimiter(20, 'Too many login attempts, please try again later.');
const adminLimiter = makeLimiter(60, 'Too many admin requests, please try again later.');
const paymentsLimiter = makeLimiter(80, 'Too many payment requests, please try again later.');
const contentLimiter = makeLimiter(150, 'Too many requests, please try again later.');
const generalLimiter = makeLimiter(200, 'Too many requests, please try again later.');
const healthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many health checks, please try again later.' },
});

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
const API = '/api/v1';

app.use(`${API}/auth`, authLimiter, authRoutes);
app.use(`${API}/courses`, contentLimiter, coursesRoutes);
app.use(`${API}/courses/:courseId/content`, contentLimiter, contentRoutes); // nested: /courses/:id/content
app.use(`${API}/enrollments`, contentLimiter, enrollmentsRoutes);
app.use(`${API}/admin`, adminLimiter, adminRoutes);
app.use(`${API}/cases`, generalLimiter, casesRoutes);

// ── 404 handler 
app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// ── Global error handler 
app.use(errorHandler);

export default app;