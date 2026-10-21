import { Types } from 'mongoose';
import Stripe from 'stripe';
import { IWebhookEvent, WebhookEvent } from '../model/webhookEvent.model';
import { handleWebhookEvent } from './payments.service';

const MAX_ATTEMPTS = 5;

export const enqueueWebhookEvent = async (event: Stripe.Event): Promise<IWebhookEvent> => {
  const existing = await WebhookEvent.findOneAndUpdate(
    { stripeEventId: event.id },
    { $setOnInsert: { type: event.type, payload: event, status: 'pending', attempts: 0 } },
    { upsert: true, new: true },
  );
  return existing;
};

const runWebhookEvent = async (doc: IWebhookEvent): Promise<void> => {
  doc.status = 'processing';
  doc.attempts += 1;
  await doc.save();

  try {
    await handleWebhookEvent(doc.payload as unknown as Stripe.Event);
    doc.status = 'completed';
    doc.processedAt = new Date();
    doc.lastError = undefined;
    await doc.save();
  } catch (error) {
    doc.status = doc.attempts >= MAX_ATTEMPTS ? 'dead' : 'failed';
    doc.lastError = error instanceof Error ? error.message : String(error);
    await doc.save();

    if (doc.status === 'dead') {
      console.error(
        `Webhook event ${doc.stripeEventId} (${doc.type}) gave up after ${doc.attempts} attempts and will not be retried:`,
        error,
      );
    } else {
      console.error(`Webhook event ${doc.stripeEventId} (${doc.type}) failed on attempt ${doc.attempts}:`, error);
    }
  }
};

export const processWebhookEventNow = (eventId: Types.ObjectId | string): void => {
  WebhookEvent.findById(eventId)
    .then((doc) => {
      if (doc && doc.status === 'pending') return runWebhookEvent(doc);
      return undefined;
    })
    .catch((error) => console.error('Failed to load webhook event for processing:', error));
};

export const processPendingWebhookEvents = async (): Promise<void> => {
  // 'dead' events (attempts >= MAX_ATTEMPTS) are excluded by status and never retried
  const stuck = await WebhookEvent.find({
    status: { $in: ['pending', 'failed'] },
  }).limit(20);

  for (const doc of stuck) {
    await runWebhookEvent(doc);
  }
};
