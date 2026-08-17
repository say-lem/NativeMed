import { Request, Response, NextFunction, RequestHandler } from 'express';

const defaultKeyGenerator = (req: Request): string => req.ip ?? 'unknown';

// ─────────────────────────────────────────────────────────────────────────────
// Leaky bucket — "meter" (traffic policing)
//
// Each key gets a bucket that fills by 1 per request and continuously drains
// at capacity/windowMs. Unlike a fixed-window counter (express-rate-limit's
// default, and what rate-limiter-flexible's plain consume() actually is too —
// see its README, "Flexible Fixed Window"), there's no reset boundary, so a
// client can't burst 2x the limit by timing requests around a window edge.
// Requests that would overflow the bucket are rejected immediately.
// ─────────────────────────────────────────────────────────────────────────────

interface MeterOptions {
  /** Burst capacity — max units the bucket can hold before it overflows */
  capacity: number;
  /** Time for a full bucket to drain back to empty */
  windowMs: number;
  message: string;
  keyGenerator?: (req: Request) => string;
}

interface MeterBucket {
  level: number;
  lastLeakAt: number;
}

export const createLeakyBucketLimiter = (opts: MeterOptions): RequestHandler => {
  const { capacity, windowMs, message } = opts;
  const keyGenerator = opts.keyGenerator ?? defaultKeyGenerator;
  const leakPerMs = capacity / windowMs;
  const buckets = new Map<string, MeterBucket>();

  // Sweep idle buckets periodically so the map doesn't grow unbounded
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      const level = Math.max(0, bucket.level - (now - bucket.lastLeakAt) * leakPerMs);
      if (level <= 0) buckets.delete(key);
    }
  }, Math.min(windowMs, 5 * 60 * 1000));
  sweep.unref?.();

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = keyGenerator(req);
    const now = Date.now();

    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { level: 0, lastLeakAt: now };
      buckets.set(key, bucket);
    }

    bucket.level = Math.max(0, bucket.level - (now - bucket.lastLeakAt) * leakPerMs);
    bucket.lastLeakAt = now;

    if (bucket.level + 1 > capacity) {
      const retryAfterMs = (bucket.level + 1 - capacity) / leakPerMs;
      res.setHeader('Retry-After', Math.ceil(retryAfterMs / 1000).toString());
      res.status(429).json({ success: false, message });
      return;
    }

    bucket.level += 1;
    next();
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Leaky bucket — "queue" (traffic shaping)
//
// Backs a background job queue (not the HTTP response cycle — holding a
// connection open for minutes to enforce spacing would just trip client/proxy
// timeouts). Jobs enqueued under the same key are drained one at a time at a
// constant rate of capacity/windowMs; a burst up to capacity is let through
// immediately, everything past that waits its turn. `maxQueueSize` is the
// bucket's overflow point — once full, further enqueues are rejected.
// ─────────────────────────────────────────────────────────────────────────────

interface QueueOptions {
  /** Jobs drained per windowMs, once the queue is flowing */
  capacity: number;
  windowMs: number;
  /** Max jobs allowed to wait their turn before overflowing */
  maxQueueSize: number;
}

interface QueueState {
  items: Array<() => void>;
  timer: NodeJS.Timeout | null;
}

export const createLeakyBucketQueue = (opts: QueueOptions) => {
  const { capacity, windowMs, maxQueueSize } = opts;
  const intervalMs = windowMs / capacity;
  const queues = new Map<string, QueueState>();

  const drain = (key: string): void => {
    const state = queues.get(key);
    if (!state) return;

    const job = state.items.shift();
    if (!job) {
      queues.delete(key);
      return;
    }

    job();
    state.timer = setTimeout(() => drain(key), intervalMs);
    state.timer.unref?.();
  };

  /** Returns true if the job was accepted (run now or queued), false if the bucket is full. */
  const enqueue = (key: string, job: () => void): boolean => {
    let state = queues.get(key);
    if (!state) {
      state = { items: [], timer: null };
      queues.set(key, state);
    }

    if (state.items.length >= maxQueueSize) {
      return false;
    }

    state.items.push(job);

    if (state.timer === null) {
      drain(key);
    }

    return true;
  };

  return { enqueue };
};
