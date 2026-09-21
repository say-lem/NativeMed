import { Schema, model, Document, Types } from 'mongoose';

// Singleton — one document gates new Case Bank purchases globally. There is
// never more than one; see getOrCreateCaseBankSettings() in the service.
export interface ICaseBankSettings extends Document {
  _id: Types.ObjectId;
  // Blocks new purchases without touching existing subscribers' access —
  // same semantics as LiveCourse.paymentsPaused / Course.paymentsPaused.
  paymentsPaused: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const caseBankSettingsSchema = new Schema<ICaseBankSettings>(
  {
    paymentsPaused: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export const CaseBankSettings = model<ICaseBankSettings>('CaseBankSettings', caseBankSettingsSchema);
