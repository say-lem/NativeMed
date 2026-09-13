import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { Types } from 'mongoose';
import { env } from '../../../config/env';
import { AppError } from '../../../shared/utils/appError';
import { UserRole } from '../../../shared/types';
import { User, IUser, RefreshToken, PasswordResetToken } from '../model/auth.model';
import {
  RegisterInput,
  LoginInput,
  RefreshTokenInput,
  ForgotPasswordInput,
  ResetPasswordInput,
  ChangePasswordInput,
  UpdateProfileInput,
  CreateAdminInput,
  UpdateUserByAdminInput,
} from '../schema/auth.schema';
import {
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendPasswordChangedEmail,
  sendAdminWelcomeEmail,
} from '../email/auth.email.service';


// Token helpers


interface TokenPayload {
  _id: string;
  email: string;
  role: UserRole;
}

// Hash any raw token for storage — used for both refresh tokens and password reset tokens.
// Raw tokens sent to clients; only hashes live in the DB.
// A DB breach cannot be leveraged to hijack sessions or reset accounts.
const hashToken = (raw: string): string =>
  crypto.createHash('sha256').update(raw).digest('hex');

// Generate a cryptographically secure temporary password
const generateTempPassword = (): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
  return Array.from(crypto.randomBytes(12))
    .map((b) => chars[b % chars.length])
    .join('');
};

const signAccessToken = (payload: TokenPayload): string =>
  jwt.sign(payload, env.ACCESS_TOKEN_SECRET, {
    expiresIn: env.ACCESS_TOKEN_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });

const createRefreshToken = async (userId: Types.ObjectId): Promise<string> => {
  const rawToken = crypto.randomBytes(64).toString('hex');

  const msMap: Record<string, number> = { d: 86_400_000, h: 3_600_000, m: 60_000 };
  const match = env.REFRESH_TOKEN_EXPIRES_IN.match(/^(\d+)([dhm])$/);
  const ms = match ? parseInt(match[1]) * (msMap[match[2]] ?? 0) : 7 * 86_400_000;

  // Only the hash is stored — a DB breach cannot be used to impersonate sessions
  await RefreshToken.create({
    tokenHash: hashToken(rawToken),
    userId,
    expiresAt: new Date(Date.now() + ms),
  });

  return rawToken; 
};

const buildAuthResponse = async (user: IUser) => {
  const payload: TokenPayload = {
    _id: user._id.toString(),
    email: user.email,
    role: user.role,
  };

  const accessToken = signAccessToken(payload);
  const refreshToken = await createRefreshToken(user._id);

  return {
    accessToken,
    refreshToken,
    user: {
      _id: user._id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      phone: user.phone,
      whatsappNumber: user.whatsappNumber,
      telegramUsername: user.telegramUsername,
      examSitting: user.examSitting,
      mustChangePassword: user.mustChangePassword,
    },
  };
};

// Public auth operations

/**
 * Register — only creates regular user accounts.
 * Admins are created via createAdmin() by an existing admin.
 */
export const register = async (input: RegisterInput) => {
  const existing = await User.findOne({ email: input.email });
  if (existing) throw new AppError('Email already in use', 409);

  const user = await User.create({
    fullName: input.fullName,
    email: input.email,
    passwordHash: input.password,
    whatsappNumber: input.whatsappNumber,
    examSitting: input.examSitting,
    role: 'user', // hardcoded — cannot self-register as admin
  });

  // Fire-and-forget — don't let email failure block registration
  sendWelcomeEmail(user.email, user.fullName).catch((err) =>
    console.error('Welcome email failed:', err),
  );

  return buildAuthResponse(user);
};

export const login = async (input: LoginInput) => {
  const user = await User.findOne({ email: input.email }).select('+passwordHash');
  if (!user) throw new AppError('Invalid email or password', 401);

  if (!user.isActive) {
    throw new AppError(
      'Your account has been deactivated. Please contact support.',
      403,
    );
  }

  const valid = await user.comparePassword(input.password);
  if (!valid) throw new AppError('Invalid email or password', 401);

  return buildAuthResponse(user);
};

export const refreshAccessToken = async (input: RefreshTokenInput) => {
  // Hash the incoming token before querying — raw tokens are never in the DB
  const stored = await RefreshToken.findOne({ tokenHash: hashToken(input.refreshToken) });
  if (!stored) throw new AppError('Invalid refresh token', 401);

  if (stored.expiresAt < new Date()) {
    await stored.deleteOne();
    throw new AppError('Refresh token expired, please log in again', 401);
  }

  const user = await User.findById(stored.userId);
  if (!user || !user.isActive) throw new AppError('User not found or inactive', 401);

  // Rotate: delete old hash, issue new raw token (and store new hash)
  await stored.deleteOne();

  const payload: TokenPayload = {
    _id: user._id.toString(),
    email: user.email,
    role: user.role,
  };

  const accessToken = signAccessToken(payload);
  const refreshToken = await createRefreshToken(user._id);

  return { accessToken, refreshToken };
};

export const logout = async (refreshTokenValue: string): Promise<void> => {
  await RefreshToken.deleteOne({ tokenHash: hashToken(refreshTokenValue) });
};

export const logoutAll = async (userId: Types.ObjectId): Promise<void> => {
  await RefreshToken.deleteMany({ userId });
};


// Forgot / reset password

/**
 * Generates a reset token, stores its hash, and emails the raw token.
 * Always responds with the same message regardless of whether the email exists —
 * this prevents user enumeration attacks.
 */
export const forgotPassword = async (input: ForgotPasswordInput): Promise<void> => {
  const user = await User.findOne({ email: input.email });

  // Silently return if user not found — no information leakage
  if (!user || !user.isActive) return;

  // Invalidate any existing reset tokens for this user
  await PasswordResetToken.deleteMany({ userId: user._id });

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(
    Date.now() + env.RESET_TOKEN_EXPIRES_MINUTES * 60 * 1000,
  );

  await PasswordResetToken.create({ tokenHash, userId: user._id, expiresAt });

  sendPasswordResetEmail(user.email, user.fullName, rawToken).catch((err) =>
    console.error('Password reset email failed:', err),
  );
};

export const resetPassword = async (input: ResetPasswordInput): Promise<void> => {
  const tokenHash = hashToken(input.token);

  const resetRecord = await PasswordResetToken.findOne({ tokenHash, used: false });

  if (!resetRecord) throw new AppError('Invalid or expired reset token', 400);
  if (resetRecord.expiresAt < new Date()) {
    await resetRecord.deleteOne();
    throw new AppError('Reset token has expired. Please request a new one.', 400);
  }

  const user = await User.findById(resetRecord.userId).select('+passwordHash');
  if (!user || !user.isActive) throw new AppError('User not found or inactive', 400);

  // Mark token as used before saving — prevents race conditions
  resetRecord.used = true;
  await resetRecord.save();

  user.passwordHash = input.newPassword;
  user.mustChangePassword = false;
  await user.save();

  // Invalidate all active sessions — user must log in fresh
  await RefreshToken.deleteMany({ userId: user._id });

  // Clean up used reset tokens
  await PasswordResetToken.deleteMany({ userId: user._id });

  sendPasswordChangedEmail(user.email, user.fullName).catch((err) =>
    console.error('Password changed email failed:', err),
  );
};


// Authenticated user operation

export const getMe = async (userId: Types.ObjectId) => {
  const user = await User.findById(userId);
  if (!user) throw new AppError('User not found', 404);
  return user;
};

export const updateProfile = async (
  userId: Types.ObjectId,
  input: UpdateProfileInput,
) => {
  const user = await User.findByIdAndUpdate(userId, input, {
    new: true,
    runValidators: true,
  });
  if (!user) throw new AppError('User not found', 404);
  return user;
};

export const changePassword = async (
  userId: Types.ObjectId,
  input: ChangePasswordInput,
): Promise<void> => {
  const user = await User.findById(userId).select('+passwordHash');
  if (!user) throw new AppError('User not found', 404);

  const valid = await user.comparePassword(input.currentPassword);
  if (!valid) throw new AppError('Current password is incorrect', 400);

  user.passwordHash = input.newPassword;
  user.mustChangePassword = false;
  await user.save();

  // Sign out all other devices on password change
  await RefreshToken.deleteMany({ userId });

  sendPasswordChangedEmail(user.email, user.fullName).catch((err) =>
    console.error('Password changed email failed:', err),
  );
};

// Admin operations

/**
 * Create an admin account — only callable by an existing admin.
 * A temporary password is auto-generated if not provided and emailed to the
 * new admin. mustChangePassword is set so they are forced to change it.
 */
export const createAdmin = async (input: CreateAdminInput) => {
  const existing = await User.findOne({ email: input.email });
  if (existing) throw new AppError('Email already in use', 409);

  const tempPassword = input.temporaryPassword ?? generateTempPassword();

  const user = await User.create({
    fullName: input.fullName,
    email: input.email,
    passwordHash: tempPassword,
    phone: input.phone,
    role: 'admin',
    mustChangePassword: true,
  });

  sendAdminWelcomeEmail(user.email, user.fullName, tempPassword).catch((err) =>
    console.error('Admin welcome email failed:', err),
  );

  return {
    _id: user._id,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
    createdAt: user.createdAt,
  };
};

/**
 * Update any user's basic profile fields or active status.
 * Admins cannot change another user's role through this endpoint.
 */
export const updateUserByAdmin = async (
  userId: string,
  input: UpdateUserByAdminInput,
) => {
  const user = await User.findByIdAndUpdate(userId, input, {
    new: true,
    runValidators: true,
  });
  if (!user) throw new AppError('User not found', 404);
  return user;
};

/**
 * Toggle isActive on a user — effectively ban/unban.
 * When deactivating, all refresh tokens are purged so they're signed out immediately.
 */
export const toggleUserStatus = async (userId: string) => {
  const user = await User.findById(userId);
  if (!user) throw new AppError('User not found', 404);
  if (user.role === 'admin') throw new AppError('Cannot deactivate an admin account through this endpoint', 403);

  user.isActive = !user.isActive;
  await user.save();

  if (!user.isActive) {
    await RefreshToken.deleteMany({ userId: user._id });
  }

  return {
    _id: user._id,
    fullName: user.fullName,
    email: user.email,
    isActive: user.isActive,
  };
};

/**
 * Paginated list of all users — for the admin user management table.
 */
export const getAllUsers = async (
  page = 1,
  limit = 20,
  role?: UserRole,
  search?: string,
) => {
  const query: Record<string, unknown> = {};
  if (role) query.role = role;
  if (search) {
    // Escape all regex metacharacters before embedding in $regex.
    // Without this, a search like ".*" or "(a+)+" becomes a ReDoS vector.
    const safeSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    query.$or = [
      { fullName: { $regex: safeSearch, $options: 'i' } },
      { email: { $regex: safeSearch, $options: 'i' } },
    ];
  }

  const [items, total] = await Promise.all([
    User.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    User.countDocuments(query),
  ]);

  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
};

/**
 * Get a single user by ID with their full profile — for the admin user detail page.
 */
export const getUserById = async (userId: string) => {
  const user = await User.findById(userId);
  if (!user) throw new AppError('User not found', 404);
  return user;
};