import { Schema, model, Document, Types } from 'mongoose';
import bcrypt from 'bcryptjs';
import { UserRole } from '../../../shared/types';


// User
export interface IUser extends Document {
  _id: Types.ObjectId;
  fullName: string;
  email: string;
  passwordHash: string;
  phone: string;
  whatsappNumber?: string;
  telegramUsername?: string;
  // Month/year the user intends to sit the exam, stored as MM/YY
  // Required for self-registered users (enforced in registerSchema); admins have none.
  examSitting?: string;
  role: UserRole;
  isActive: boolean;
  // Forces a password change on next login — used when admin creates an account
  mustChangePassword: boolean;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

const userSchema = new Schema<IUser>(
  {
    fullName: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: { type: String, required: true, select: false },
    phone: { type: String, required: true, trim: true },
    whatsappNumber: { type: String, trim: true },
    telegramUsername: { type: String, trim: true },
    examSitting: {
      type: String,
      trim: true,
      match: [/^(0[1-9]|1[0-2])\/\d{2}$/, 'examSitting must be in MM/YY format'],
    },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
    },
    isActive: { type: Boolean, default: true },
    mustChangePassword: { type: Boolean, default: false },
  },
  { timestamps: true },
);

// Hash password before save
userSchema.pre('save', async function () {
  if (!this.isModified('passwordHash')) return;
  const salt = await bcrypt.genSalt(12);
  this.passwordHash = await bcrypt.hash(this.passwordHash, salt);
});

userSchema.methods.comparePassword = function (candidate: string): Promise<boolean> {
  return bcrypt.compare(candidate, this.passwordHash);
};

// Never expose passwordHash in JSON responses
userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    const safeRet = ret as unknown as Record<string, unknown>;
    delete safeRet.passwordHash;
    delete safeRet.__v;
    return safeRet;
  },
});

export const User = model<IUser>('User', userSchema);


// RefreshToken
// Stored in DB so we can invalidate tokens on logout or password change without
// waiting for natural expiry.


export interface IRefreshToken extends Document {
  tokenHash: string;       // SHA-256 of the raw token — raw token is never stored
  userId: Types.ObjectId;
  expiresAt: Date;
  createdAt: Date;
}

const refreshTokenSchema = new Schema<IRefreshToken>(
  {
    tokenHash: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// Auto-delete via MongoDB TTL index
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
// Bulk purge by user on logout-all / password change
refreshTokenSchema.index({ userId: 1 });

export const RefreshToken = model<IRefreshToken>('RefreshToken', refreshTokenSchema);

// PasswordResetToken
// Short-lived, single-use token. The raw token goes in the email link;
// only the SHA-256 hash is stored — so a DB breach can't be used to reset
// accounts without the original email.

export interface IPasswordResetToken extends Document {
  tokenHash: string;         // SHA-256 of the raw token
  userId: Types.ObjectId;
  expiresAt: Date;
  used: boolean;
  createdAt: Date;
}

const passwordResetTokenSchema = new Schema<IPasswordResetToken>(
  {
    tokenHash: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    expiresAt: { type: Date, required: true },
    used: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// Auto-delete after expiry via TTL index
passwordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
// One active reset per user at a time
passwordResetTokenSchema.index({ userId: 1 });

export const PasswordResetToken = model<IPasswordResetToken>(
  'PasswordResetToken',
  passwordResetTokenSchema,
);