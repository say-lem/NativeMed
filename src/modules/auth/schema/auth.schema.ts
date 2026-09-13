import { z } from 'zod';


// Reusable field definitions

const passwordField = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

const mongoId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid ID');

// Month/year the user intends to sit the exam, e.g. "03/26"
const examSittingField = z
  .string()
  .trim()
  .regex(/^(0[1-9]|1[0-2])\/\d{2}$/, 'examSitting must be in MM/YY format');

// Public auth schemas

export const registerSchema = z.object({
  fullName: z.string().min(2, 'Full name must be at least 2 characters').trim(),
  email: z.string().email('Invalid email address').toLowerCase().trim(),
  password: passwordField,
  whatsappNumber: z.string().trim().optional(),
  examSitting: examSittingField,
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email').toLowerCase().trim(),
  password: z.string().min(1, 'Password is required'),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email').toLowerCase().trim(),
});

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1, 'Reset token is required'),
    newPassword: passwordField,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });


// Authenticated user schemas

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: passwordField,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: 'New password must be different from current password',
    path: ['newPassword'],
  });

export const updateProfileSchema = z.object({
  fullName: z.string().min(2).trim().optional(),
  phone: z.string().min(7).trim().optional(),
  whatsappNumber: z.string().trim().optional(),
  telegramUsername: z
    .string()
    .trim()
    .transform((v) => (v && !v.startsWith('@') ? `@${v}` : v))
    .optional(),
  examSitting: examSittingField.optional(),
});


// Admin-only schemas


export const createAdminSchema = z.object({
  fullName: z.string().min(2).trim(),
  email: z.string().email().toLowerCase().trim(),
  phone: z.string().min(7).trim(),
  // If omitted the service auto-generates a secure temporary password
  temporaryPassword: z
    .string()
    .min(8)
    .optional(),
});

export const updateUserByAdminSchema = z.object({
  fullName: z.string().min(2).trim().optional(),
  phone: z.string().min(7).trim().optional(),
  isActive: z.boolean().optional(),
  examSitting: examSittingField.optional(),
});

export const adminUserIdSchema = z.object({
  userId: mongoId,
});


// Inferred types


export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type CreateAdminInput = z.infer<typeof createAdminSchema>;
export type UpdateUserByAdminInput = z.infer<typeof updateUserByAdminSchema>;