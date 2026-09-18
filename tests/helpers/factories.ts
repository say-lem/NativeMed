import { Types } from 'mongoose';
import { User } from '../../src/modules/auth/model/auth.model';
import { Course } from '../../src/modules/courses/model/courses.model';
import { LiveCourse } from '../../src/modules/liveCourses/model/liveCourses.model';

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

let liveCourseCounter = 0;

export const createTestLiveCourse = async (
  createdBy: Types.ObjectId,
  overrides: Record<string, unknown> = {},
) => {
  liveCourseCounter += 1;
  const now = Date.now();
  return LiveCourse.create({
    title: `Test Live Course ${liveCourseCounter}`,
    description: 'A live course used in tests',
    price: 120,
    startDate: new Date(now + 7 * 24 * 60 * 60 * 1000),
    endDate: new Date(now + 14 * 24 * 60 * 60 * 1000),
    isPublished: true,
    createdBy,
    ...overrides,
  });
};
