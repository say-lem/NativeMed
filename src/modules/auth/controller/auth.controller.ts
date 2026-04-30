import { Request, Response } from 'express';
import { asyncHandler } from '../../../shared/middleware/asyncHandler';
import { ApiResponse } from '../../../shared/utils/apiResponse';
import { AuthRequest } from '../../../shared/types';
import * as authService from '../service/auth.service';

const getSingleParam = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? value[0] : (value ?? '');


// Public controllers


export const register = asyncHandler(async (req: Request, res: Response) => {
  const data = await authService.register(req.body);
  return ApiResponse.created(res, 'Registration successful', data);
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const data = await authService.login(req.body);
  return ApiResponse.success(res, 'Login successful', data);
});

export const refreshToken = asyncHandler(async (req: Request, res: Response) => {
  const data = await authService.refreshAccessToken(req.body);
  return ApiResponse.success(res, 'Token refreshed', data);
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  await authService.logout(req.body.refreshToken as string);
  return ApiResponse.success(res, 'Logged out successfully');
});

export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  await authService.forgotPassword(req.body);
  // Always the same message — prevents user enumeration
  return ApiResponse.success(
    res,
    'If that email is registered, a password reset link has been sent.',
  );
});

export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  await authService.resetPassword(req.body);
  return ApiResponse.success(
    res,
    'Password reset successfully. Please log in with your new password.',
  );
});


// Authenticated user controllers


export const getMe = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await authService.getMe(req.user!._id);
  return ApiResponse.success(res, 'Profile fetched', user);
});

export const updateProfile = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await authService.updateProfile(req.user!._id, req.body);
  return ApiResponse.success(res, 'Profile updated', user);
});

export const logoutAll = asyncHandler(async (req: AuthRequest, res: Response) => {
  await authService.logoutAll(req.user!._id);
  return ApiResponse.success(res, 'Logged out from all devices');
});

export const changePassword = asyncHandler(async (req: AuthRequest, res: Response) => {
  await authService.changePassword(req.user!._id, req.body);
  return ApiResponse.success(
    res,
    'Password changed successfully. All other sessions have been signed out.',
  );
});


// Admin controllers

export const createAdmin = asyncHandler(async (req: Request, res: Response) => {
  const data = await authService.createAdmin(req.body);
  return ApiResponse.created(
    res,
    'Admin account created. A welcome email has been sent with login credentials.',
    data,
  );
});

export const getAllUsers = asyncHandler(async (req: Request, res: Response) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;
  const role = req.query.role as 'user' | 'admin' | undefined;
  const search = req.query.search as string | undefined;

  const result = await authService.getAllUsers(page, limit, role, search);
  return ApiResponse.success(res, 'Users fetched', result);
});

export const getUserById = asyncHandler(async (req: Request, res: Response) => {
  const user = await authService.getUserById(getSingleParam(req.params.userId));
  return ApiResponse.success(res, 'User fetched', user);
});

export const updateUserByAdmin = asyncHandler(async (req: Request, res: Response) => {
  const user = await authService.updateUserByAdmin(getSingleParam(req.params.userId), req.body);
  return ApiResponse.success(res, 'User updated', user);
});

export const toggleUserStatus = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.toggleUserStatus(getSingleParam(req.params.userId));
  return ApiResponse.success(
    res,
    `User ${result.isActive ? 'activated' : 'deactivated'} successfully`,
    result,
  );
});