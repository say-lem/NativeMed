import dns from 'dns';
import { env } from './config/env';
import { connectDB } from './config/db';
import app from './app';

// Render (and several other hosts) resolve outbound IPv6 addresses for hosts
// like smtp.gmail.com but don't actually route IPv6 traffic, causing
// ENETUNREACH on the first connection attempt. Preferring IPv4 avoids it.
dns.setDefaultResultOrder('ipv4first');

const start = async () => {
  await connectDB();

  const server = app.listen(env.PORT, () => {
    console.log(` Server running on port ${env.PORT} [${env.NODE_ENV}]`);
    console.log(`API base: http://localhost:${env.PORT}/api/v1`);
  });

  // ── Graceful shutdown 
  const shutdown = (signal: string) => {
    console.log(`\n  ${signal} received — shutting down gracefully`);
    server.close(() => {
      console.log(' HTTP server closed');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Crash loudly on unhandled rejections in development
  process.on('unhandledRejection', (reason) => {
    console.error(' Unhandled rejection:', reason);
    if (env.NODE_ENV === 'production') {
      server.close(() => process.exit(1));
    }
  });
};

start();