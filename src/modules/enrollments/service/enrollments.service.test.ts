import { Types } from 'mongoose';
import * as enrollmentsService from './enrollments.service';
import { Enrollment } from '../model/enrollments.model';
import { createTestUser, createTestCourse, objectId } from '../../../../tests/helpers/factories';

describe('enrollments.service', () => {
  describe('isEnrolled', () => {
    it('is false when there is no enrollment', async () => {
      const user = await createTestUser();
      const course = await createTestCourse(objectId());

      expect(await enrollmentsService.isEnrolled(user._id, course._id.toString())).toBe(false);
    });

    it('is true once enrolled and active', async () => {
      const user = await createTestUser();
      const course = await createTestCourse(objectId());
      await enrollmentsService.createEnrollment(user._id, course._id.toString(), objectId());

      expect(await enrollmentsService.isEnrolled(user._id, course._id.toString())).toBe(true);
    });
  });

  describe('createEnrollment', () => {
    it('is idempotent — a second call upserts rather than duplicating', async () => {
      const user = await createTestUser();
      const course = await createTestCourse(objectId());

      await enrollmentsService.createEnrollment(user._id, course._id.toString(), objectId());
      await enrollmentsService.createEnrollment(user._id, course._id.toString(), objectId());

      expect(await Enrollment.countDocuments({ userId: user._id, courseId: course._id })).toBe(1);
    });
  });

  describe('manualEnroll', () => {
    it('grants comped access with source "manual"', async () => {
      const admin = await createTestUser({ role: 'admin' });
      const user = await createTestUser();
      const course = await createTestCourse(admin._id);

      const enrollment = await enrollmentsService.manualEnroll(
        user._id.toString(),
        course._id.toString(),
        admin._id,
      );

      expect(enrollment.source).toBe('manual');
      expect(enrollment.grantedBy?.toString()).toBe(admin._id.toString());
      expect(enrollment.isActive).toBe(true);
    });

    it('throws 404 for a missing user', async () => {
      const admin = await createTestUser({ role: 'admin' });
      const course = await createTestCourse(admin._id);

      await expect(
        enrollmentsService.manualEnroll(new Types.ObjectId().toString(), course._id.toString(), admin._id),
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it('throws 404 for a missing course', async () => {
      const admin = await createTestUser({ role: 'admin' });
      const user = await createTestUser();

      await expect(
        enrollmentsService.manualEnroll(user._id.toString(), new Types.ObjectId().toString(), admin._id),
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it('throws 409 when already actively enrolled', async () => {
      const admin = await createTestUser({ role: 'admin' });
      const user = await createTestUser();
      const course = await createTestCourse(admin._id);
      await enrollmentsService.manualEnroll(user._id.toString(), course._id.toString(), admin._id);

      await expect(
        enrollmentsService.manualEnroll(user._id.toString(), course._id.toString(), admin._id),
      ).rejects.toMatchObject({ statusCode: 409 });
    });
  });

  describe('revokeEnrollment / restoreEnrollment', () => {
    it('revoke deactivates, restore reactivates', async () => {
      const user = await createTestUser();
      const course = await createTestCourse(objectId());
      await enrollmentsService.createEnrollment(user._id, course._id.toString(), objectId());

      await enrollmentsService.revokeEnrollment(user._id.toString(), course._id.toString());
      const revoked = await Enrollment.findOne({ userId: user._id, courseId: course._id });
      expect(revoked?.isActive).toBe(false);

      const restored = await enrollmentsService.restoreEnrollment(revoked!._id.toString());
      expect(restored.isActive).toBe(true);
    });

    it('revoke throws 404 for a missing enrollment', async () => {
      await expect(
        enrollmentsService.revokeEnrollment(new Types.ObjectId().toString(), new Types.ObjectId().toString()),
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it('revoke throws 400 when already inactive', async () => {
      const user = await createTestUser();
      const course = await createTestCourse(objectId());
      await enrollmentsService.createEnrollment(user._id, course._id.toString(), objectId());
      await enrollmentsService.revokeEnrollment(user._id.toString(), course._id.toString());

      await expect(
        enrollmentsService.revokeEnrollment(user._id.toString(), course._id.toString()),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('restore throws 400 when already active', async () => {
      const user = await createTestUser();
      const course = await createTestCourse(objectId());
      const enrollment = await enrollmentsService.createEnrollment(user._id, course._id.toString(), objectId());

      await expect(enrollmentsService.restoreEnrollment(enrollment._id.toString())).rejects.toMatchObject({
        statusCode: 400,
      });
    });
  });

  describe('deleteAllEnrollmentsForCourse', () => {
    it('deletes every enrollment record for the course', async () => {
      const course = await createTestCourse(objectId());
      const userA = await createTestUser();
      const userB = await createTestUser();
      await enrollmentsService.createEnrollment(userA._id, course._id.toString(), objectId());
      await enrollmentsService.createEnrollment(userB._id, course._id.toString(), objectId());

      await enrollmentsService.deleteAllEnrollmentsForCourse(course._id.toString());

      const remaining = await Enrollment.countDocuments({ courseId: course._id });
      expect(remaining).toBe(0);
    });

    it('does not throw when there are no enrollments', async () => {
      await expect(
        enrollmentsService.deleteAllEnrollmentsForCourse(new Types.ObjectId().toString()),
      ).resolves.toBeUndefined();
    });
  });

  describe('reads', () => {
    it('getMyEnrollments only returns active enrollments', async () => {
      const user = await createTestUser();
      const courseA = await createTestCourse(objectId());
      const courseB = await createTestCourse(objectId());
      await enrollmentsService.createEnrollment(user._id, courseA._id.toString(), objectId());
      await enrollmentsService.createEnrollment(user._id, courseB._id.toString(), objectId());
      await enrollmentsService.revokeEnrollment(user._id.toString(), courseB._id.toString());

      const mine = await enrollmentsService.getMyEnrollments(user._id);
      expect(mine).toHaveLength(1);
    });

    it('checkEnrollment reflects enrollment state', async () => {
      const user = await createTestUser();
      const course = await createTestCourse(objectId());

      expect(await enrollmentsService.checkEnrollment(user._id, course._id.toString())).toEqual({
        enrolled: false,
      });

      await enrollmentsService.createEnrollment(user._id, course._id.toString(), objectId());
      const result = await enrollmentsService.checkEnrollment(user._id, course._id.toString());
      expect(result.enrolled).toBe(true);
    });

    it('getAllEnrollments paginates across all users', async () => {
      const course = await createTestCourse(objectId());
      const userA = await createTestUser();
      const userB = await createTestUser();
      await enrollmentsService.createEnrollment(userA._id, course._id.toString(), objectId());
      await enrollmentsService.createEnrollment(userB._id, course._id.toString(), objectId());

      const result = await enrollmentsService.getAllEnrollments(1, 20);
      expect(result.total).toBe(2);
    });

    it('getEnrollmentsByCourse and getEnrollmentsByUser scope correctly', async () => {
      const courseA = await createTestCourse(objectId());
      const courseB = await createTestCourse(objectId());
      const user = await createTestUser();
      await enrollmentsService.createEnrollment(user._id, courseA._id.toString(), objectId());
      await enrollmentsService.createEnrollment(user._id, courseB._id.toString(), objectId());

      const byCourse = await enrollmentsService.getEnrollmentsByCourse(courseA._id.toString(), 1, 20);
      expect(byCourse.total).toBe(1);

      const byUser = await enrollmentsService.getEnrollmentsByUser(user._id.toString());
      expect(byUser).toHaveLength(2);
    });
  });
});
