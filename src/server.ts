
import dns from 'dns';
import mongoose from 'mongoose';
import { env } from './config/env';
import { connectDB } from './config/db';
import app from './app';
import { releaseExpiredPendingBookings } from './modules/booking/service/booking.service';
import { processPendingWebhookEvents } from './modules/payments/service/webhookQueue.service';

// Prefer IPv4 for outbound connections
dns.setDefaultResultOrder('ipv4first');

const start = () => {
  // Use the hosting provider's PORT when available
  const PORT = Number(process.env.PORT || env.PORT || 5000);

  // Start Express immediately without waiting for MongoDB
  const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT} [${env.NODE_ENV}]`);
    console.log(`API base: /api/v1`);
  });

  let bookingSweepInterval: ReturnType<typeof setInterval> | undefined;
  let webhookSweepInterval: ReturnType<typeof setInterval> | undefined;

  // Connect to MongoDB independently
  const initializeDatabase = async () => {
    try {
      await connectDB();
      console.log('Database initialization completed');

      // Start booking cleanup only after MongoDB connects
      const sweepExpiredBookings = () => {
        releaseExpiredPendingBookings().catch((err) =>
          console.error('Failed to release expired pending bookings:', err),
        );
      };

      sweepExpiredBookings();

      bookingSweepInterval = setInterval(
        sweepExpiredBookings,
        5 * 60 * 1000,
      );

      // Retry any webhook events left pending/failed (e.g. after a crash or a failed attempt)
      const sweepWebhookEvents = () => {
        processPendingWebhookEvents().catch((err) =>
          console.error('Failed to process pending webhook events:', err),
        );
      };

      sweepWebhookEvents();

      webhookSweepInterval = setInterval(
        sweepWebhookEvents,
        60 * 1000,
      );
    } catch (error) {
      console.error('Database initialization failed:', error);

      // Stop the application if the database cannot connect
      server.close(() => process.exit(1));
    }
  };

  void initializeDatabase();

  // Graceful shutdown
  const shutdown = (signal: string) => {
    console.log(`${signal} received — shutting down gracefully`);

    if (bookingSweepInterval) {
      clearInterval(bookingSweepInterval);
    }

    if (webhookSweepInterval) {
      clearInterval(webhookSweepInterval);
    }

    server.close(async () => {
      console.log('HTTP server closed');

      try {
        await mongoose.disconnect();
        console.log('MongoDB disconnected');
      } catch (error) {
        console.error('MongoDB disconnect error:', error);
      }

      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    console.error('Unhandled rejection:', reason);

    if (env.NODE_ENV === 'production') {
      shutdown('unhandledRejection');
    }
  });
};

start();