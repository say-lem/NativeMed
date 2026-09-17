import { Types } from 'mongoose';
import { User } from '../../src/modules/auth/model/auth.model';
import { Course } from '../../src/modules/courses/model/courses.model';

export const objectId = (): Types.ObjectId => new Types.ObjectId();

let userCounter = 0;

export const createTestUser = async (overrides: Partial<{
  fullName: string;
  email: string;
  password: string;
  phone: string;
  role: 'user' | 'admin';
  isActive: boolean;
}> = {}) => {
  userCounter += 1;
  return User.create({
    fullName: overrides.fullName ?? `Test User ${userCounter}`,
    email: overrides.email ?? `test-user-${userCounter}@example.com`,
    passwordHash: overrides.password ?? 'Password123!',
    phone: overrides.phone ?? '07000000000',
    role: overrides.role ?? 'user',
    isActive: overrides.isActive ?? true,
  });
};

let courseCounter = 0;

export const createTestCourse = async (
  createdBy: Types.ObjectId,
  overrides: Record<string, unknown> = {},
) => {
  courseCounter += 1;
  return Course.create({
    title: `Test Course ${courseCounter}`,
    description: 'A course used in tests',
    pricing: { monthly: 80 },
    isPublished: true,
    createdBy,
    ...overrides,
  });
};
