jest.mock('../email/auth.email.service', () => ({
  sendWelcomeEmail: jest.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
  sendPasswordChangedEmail: jest.fn().mockResolvedValue(undefined),
  sendAdminWelcomeEmail: jest.fn().mockResolvedValue(undefined),
}));

import * as authService from './auth.service';
import { User, RefreshToken, PasswordResetToken } from '../model/auth.model';
import {
  sendPasswordResetEmail,
  sendAdminWelcomeEmail,
} from '../email/auth.email.service';

const mockedSendPasswordResetEmail = sendPasswordResetEmail as jest.MockedFunction<
  typeof sendPasswordResetEmail
>;
const mockedSendAdminWelcomeEmail = sendAdminWelcomeEmail as jest.MockedFunction<
  typeof sendAdminWelcomeEmail
>;

const registerInput = {
  fullName: 'Grace Hopper',
  email: 'grace@example.com',
  password: 'Password1!',
  whatsappNumber: undefined,
  examSitting: '03/26',
};

describe('auth.service', () => {
  beforeEach(() => {
    mockedSendPasswordResetEmail.mockClear();
    mockedSendAdminWelcomeEmail.mockClear();
  });

  describe('register', () => {
    it('creates a regular user and returns tokens', async () => {
      const result = await authService.register(registerInput);

      expect(result.user.role).toBe('user');
      expect(result.user.email).toBe('grace@example.com');
      expect(result.accessToken).toEqual(expect.any(String));
      expect(result.refreshToken).toEqual(expect.any(String));
      expect((result.user as unknown as { passwordHash?: string }).passwordHash).toBeUndefined();
    });

    it('no longer collects phone or telegramUsername at registration', async () => {
      await authService.register(registerInput);

      const stored = await User.findOne({ email: registerInput.email });
      expect(stored?.phone).toBeUndefined();
      expect(stored?.telegramUsername).toBeUndefined();
    });

    it('rejects a duplicate email', async () => {
      await authService.register(registerInput);
      await expect(authService.register(registerInput)).rejects.toMatchObject({ statusCode: 409 });
    });
  });

  describe('login', () => {
    it('logs in with correct credentials', async () => {
      await authService.register(registerInput);

      const result = await authService.login({ email: registerInput.email, password: registerInput.password });
      expect(result.user.email).toBe(registerInput.email);
    });

    it('rejects an unknown email', async () => {
      await expect(
        authService.login({ email: 'nobody@example.com', password: 'whatever' }),
      ).rejects.toMatchObject({ statusCode: 401 });
    });

    it('rejects the wrong password', async () => {
      await authService.register(registerInput);
      await expect(
        authService.login({ email: registerInput.email, password: 'WrongPassword1!' }),
      ).rejects.toMatchObject({ statusCode: 401 });
    });

    it('rejects a deactivated account', async () => {
      await authService.register(registerInput);
      await User.findOneAndUpdate({ email: registerInput.email }, { isActive: false });

      await expect(
        authService.login({ email: registerInput.email, password: registerInput.password }),
      ).rejects.toMatchObject({ statusCode: 403 });
    });
  });

  describe('refreshAccessToken / logout / logoutAll', () => {
    it('rotates the refresh token on refresh', async () => {
      const { refreshToken } = await authService.register(registerInput);

      const rotated = await authService.refreshAccessToken({ refreshToken });
      expect(rotated.accessToken).toEqual(expect.any(String));
      expect(rotated.refreshToken).not.toBe(refreshToken);

      // Old token was deleted as part of rotation
      await expect(authService.refreshAccessToken({ refreshToken })).rejects.toMatchObject({
        statusCode: 401,
      });
    });

    it('rejects an unknown refresh token', async () => {
      await expect(authService.refreshAccessToken({ refreshToken: 'not-a-real-token' })).rejects.toMatchObject({
        statusCode: 401,
      });
    });

    it('rejects and deletes an expired refresh token', async () => {
      const { refreshToken } = await authService.register(registerInput);
      await RefreshToken.updateMany({}, { expiresAt: new Date(Date.now() - 1000) });

      await expect(authService.refreshAccessToken({ refreshToken })).rejects.toMatchObject({
        statusCode: 401,
      });
      expect(await RefreshToken.countDocuments()).toBe(0);
    });

    it('logout removes only the matching token', async () => {
      const { refreshToken } = await authService.register(registerInput);
      await authService.logout(refreshToken);
      expect(await RefreshToken.countDocuments()).toBe(0);
    });

    it('logoutAll removes every token for the user', async () => {
      const { user, refreshToken: firstToken } = await authService.register(registerInput);
      const { refreshToken: secondToken } = await authService.login({
        email: registerInput.email,
        password: registerInput.password,
      });
      expect(firstToken).not.toBe(secondToken);
      expect(await RefreshToken.countDocuments()).toBe(2);

      await authService.logoutAll(user._id);
      expect(await RefreshToken.countDocuments()).toBe(0);
    });
  });

  describe('forgotPassword / resetPassword', () => {
    it('silently no-ops for an unknown email', async () => {
      await expect(authService.forgotPassword({ email: 'ghost@example.com' })).resolves.toBeUndefined();
      expect(mockedSendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('issues a reset token and resets the password end-to-end', async () => {
      await authService.register(registerInput);

      await authService.forgotPassword({ email: registerInput.email });
      expect(mockedSendPasswordResetEmail).toHaveBeenCalledTimes(1);
      const rawToken = mockedSendPasswordResetEmail.mock.calls[0][2];

      const newPassword = 'NewPassword1!';
      await authService.resetPassword({
        token: rawToken,
        newPassword,
        confirmPassword: newPassword,
      });

      // All sessions were invalidated by the reset
      expect(await RefreshToken.countDocuments()).toBe(0);

      // Old password no longer works, new one does
      await expect(
        authService.login({ email: registerInput.email, password: registerInput.password }),
      ).rejects.toMatchObject({ statusCode: 401 });
      await expect(
        authService.login({ email: registerInput.email, password: newPassword }),
      ).resolves.toBeDefined();
    });

    it('rejects reusing an already-used reset token', async () => {
      await authService.register(registerInput);
      await authService.forgotPassword({ email: registerInput.email });
      const rawToken = mockedSendPasswordResetEmail.mock.calls[0][2];

      const newPassword = 'NewPassword1!';
      await authService.resetPassword({ token: rawToken, newPassword, confirmPassword: newPassword });

      await expect(
        authService.resetPassword({ token: rawToken, newPassword: 'AnotherOne1!', confirmPassword: 'AnotherOne1!' }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('rejects an expired reset token and cleans it up', async () => {
      await authService.register(registerInput);
      await authService.forgotPassword({ email: registerInput.email });
      await PasswordResetToken.updateMany({}, { expiresAt: new Date(Date.now() - 1000) });
      const rawToken = mockedSendPasswordResetEmail.mock.calls[0][2];

      await expect(
        authService.resetPassword({ token: rawToken, newPassword: 'NewPassword1!', confirmPassword: 'NewPassword1!' }),
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(await PasswordResetToken.countDocuments()).toBe(0);
    });

    it('rejects an unknown reset token', async () => {
      await expect(
        authService.resetPassword({ token: 'bogus', newPassword: 'NewPassword1!', confirmPassword: 'NewPassword1!' }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe('getMe / updateProfile / changePassword', () => {
    it('getMe returns the user, 404 if missing', async () => {
      const { user } = await authService.register(registerInput);
      const found = await authService.getMe(user._id);
      expect(found.email).toBe(registerInput.email);

      const { Types } = await import('mongoose');
      await expect(authService.getMe(new Types.ObjectId())).rejects.toMatchObject({ statusCode: 404 });
    });

    it('updateProfile updates allowed fields', async () => {
      const { user } = await authService.register(registerInput);
      const updated = await authService.updateProfile(user._id, { fullName: 'Grace M. Hopper' });
      expect(updated.fullName).toBe('Grace M. Hopper');
    });

    it('changePassword succeeds with the correct current password and revokes sessions', async () => {
      const { user } = await authService.register(registerInput);
      await authService.login({ email: registerInput.email, password: registerInput.password });
      expect(await RefreshToken.countDocuments()).toBe(2);

      await authService.changePassword(user._id, {
        currentPassword: registerInput.password,
        newPassword: 'BrandNew1!',
        confirmPassword: 'BrandNew1!',
      });

      expect(await RefreshToken.countDocuments()).toBe(0);

      await expect(
        authService.login({ email: registerInput.email, password: 'BrandNew1!' }),
      ).resolves.toBeDefined();
    });

    it('changePassword rejects an incorrect current password', async () => {
      const { user } = await authService.register(registerInput);
      await expect(
        authService.changePassword(user._id, {
          currentPassword: 'WrongCurrent1!',
          newPassword: 'BrandNew1!',
          confirmPassword: 'BrandNew1!',
        }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe('admin operations', () => {
    it('createAdmin creates an admin forced to change password and emails the temp password', async () => {
      const admin = await authService.createAdmin({
        fullName: 'Ada Admin',
        email: 'ada-admin@example.com',
        phone: '07000000002',
      });

      expect(admin.role).toBe('admin');
      expect(admin.mustChangePassword).toBe(true);
      expect(mockedSendAdminWelcomeEmail).toHaveBeenCalledTimes(1);
    });

    it('createAdmin rejects a duplicate email', async () => {
      await authService.createAdmin({ fullName: 'Ada Admin', email: 'dup@example.com', phone: '07000000002' });
      await expect(
        authService.createAdmin({ fullName: 'Ada Admin 2', email: 'dup@example.com', phone: '07000000003' }),
      ).rejects.toMatchObject({ statusCode: 409 });
    });

    it('updateUserByAdmin updates fields, 404 if missing', async () => {
      const { user } = await authService.register(registerInput);
      const updated = await authService.updateUserByAdmin(user._id.toString(), { fullName: 'Updated Name' });
      expect(updated.fullName).toBe('Updated Name');

      const { Types } = await import('mongoose');
      await expect(
        authService.updateUserByAdmin(new Types.ObjectId().toString(), { fullName: 'x' }),
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it('toggleUserStatus flips isActive and purges sessions on deactivation', async () => {
      const { user } = await authService.register(registerInput);
      await authService.login({ email: registerInput.email, password: registerInput.password });

      const toggled = await authService.toggleUserStatus(user._id.toString());
      expect(toggled.isActive).toBe(false);
      expect(await RefreshToken.countDocuments()).toBe(0);
    });

    it('toggleUserStatus refuses to deactivate an admin', async () => {
      const admin = await authService.createAdmin({
        fullName: 'Ada Admin',
        email: 'ada-admin-2@example.com',
        phone: '07000000004',
      });

      await expect(authService.toggleUserStatus(admin._id.toString())).rejects.toMatchObject({
        statusCode: 403,
      });
    });

    it('getAllUsers paginates and filters by role and search', async () => {
      await authService.register(registerInput);
      await authService.createAdmin({ fullName: 'Search Target Admin', email: 'searchme@example.com', phone: '07000000005' });

      const admins = await authService.getAllUsers(1, 20, 'admin');
      expect(admins.items.every((u) => u.role === 'admin')).toBe(true);

      const bySearch = await authService.getAllUsers(1, 20, undefined, 'Search Target');
      expect(bySearch.items).toHaveLength(1);
      expect(bySearch.items[0].email).toBe('searchme@example.com');
    });

    it('getUserById returns the user, 404 if missing', async () => {
      const { user } = await authService.register(registerInput);
      const found = await authService.getUserById(user._id.toString());
      expect(found.email).toBe(registerInput.email);

      const { Types } = await import('mongoose');
      await expect(authService.getUserById(new Types.ObjectId().toString())).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });
});
