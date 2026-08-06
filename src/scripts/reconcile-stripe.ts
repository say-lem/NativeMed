/**
 * reconcile-stripe.ts
 * -------------------
 * Syncs local subscription records from Stripe. Run periodically (e.g. daily cron)
 * to recover from missed webhooks after Stripe stops retrying.
 *
 * Usage:
 *   npm run reconcile:stripe
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { connectDB } from '../config/db';
import * as subscriptionsService from '../modules/subscriptions/service/subscriptions.service';

dotenv.config();

const main = async () => {
  await connectDB();

  const { synced, errors } = await subscriptionsService.reconcileAllFromStripe();
  console.log(`Stripe reconciliation complete: ${synced} synced, ${errors} errors`);

  await mongoose.disconnect();
  process.exit(errors > 0 ? 1 : 0);
};

main().catch(async (error) => {
  console.error('Stripe reconciliation failed:', error);
  await mongoose.disconnect();
  process.exit(1);
});
