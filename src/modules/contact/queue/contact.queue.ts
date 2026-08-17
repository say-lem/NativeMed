import { createLeakyBucketQueue } from '../../../shared/middleware/leakyBucket';

// Leaky bucket "queue" (traffic shaping) for the public contact form — the
// endpoint's only job is sending an email, so bursts are smoothed to a steady
// send rate per IP instead of being rejected outright. 10 messages/15min
// burst, drained one at a time; a further 10 may queue behind that before
// overflowing.
export const contactMessageQueue = createLeakyBucketQueue({
  capacity: 10,
  windowMs: 15 * 60 * 1000,
  maxQueueSize: 10,
});
