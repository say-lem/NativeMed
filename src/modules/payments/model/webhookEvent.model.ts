import { Schema, model, Document, Types } from 'mongoose';

export type WebhookEventStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'dead';

export interface IWebhookEvent extends Document {
  _id: Types.ObjectId;
  stripeEventId: string;
  type: string;
  payload: Record<string, unknown>;
  status: WebhookEventStatus;
  attempts: number;
  lastError?: string;
  processedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const webhookEventSchema = new Schema<IWebhookEvent>(
  {
    stripeEventId: { type: String, required: true, unique: true },
    type:          { type: String, required: true },
    payload:       { type: Schema.Types.Mixed, required: true },
    status:        {
      type:    String,
      enum:    ['pending', 'processing', 'completed', 'failed', 'dead'],
      default: 'pending',
    },
    attempts:   { type: Number, default: 0 },
    lastError:  { type: String },
    processedAt: { type: Date },
  },
  { timestamps: true },
);

// drives the retry sweep — find stuck pending/failed events needing a(nother) attempt
webhookEventSchema.index({ status: 1, attempts: 1 });

export const WebhookEvent = model<IWebhookEvent>('WebhookEvent', webhookEventSchema);
