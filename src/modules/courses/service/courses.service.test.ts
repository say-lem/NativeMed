jest.mock('../../../config/cloudinary', () => require('../../../../tests/mocks/cloudinary.mock'));

import { Types } from 'mongoose';
import * as coursesService from './courses.service';
import { Course } from '../model/courses.model';
import { cloudinaryMock, uploadBuffer } from '../../../../tests/mocks/cloudinary.mock';
import { objectId } from '../../../../tests/helpers/factories';

const validCreateInput = {
  title: 'MRCGP CSA Prep',
  description: 'A full prep course for the CSA exam.',
  pricing: { monthly: 70 },
  driveFolderId: 'drive-folder-id',
};

describe('courses.service', () => {
  beforeEach(() => {
    uploadBuffer.mockClear();
    cloudinaryMock.uploader.destroy.mockClear();
  });

  describe('createCourse', () => {
    it('creates a course owned by the admin, without leaking internal fields', async () => {
      const adminId = objectId();
      const course = await coursesService.createCourse(validCreateInput, adminId);

      expect(course.title).toBe(validCreateInput.title);
      expect(course.thumbnailPublicId).toBeUndefined();
    });
  });

  describe('assertCourseHasPricing', () => {
    it('throws when pricing has no price at all', () => {
      expect(() => coursesService.assertCourseHasPricing({})).toThrow(
        /At least one of monthly or quarterly/,
      );
    });

    it('passes when at least one price is set', () => {
      expect(() =>
        coursesService.assertCourseHasPricing({ quarterly: 100 }),
      ).not.toThrow();
    });
  });

  describe('updateCourse', () => {
    it('sets detailedDescription', async () => {
      const adminId = objectId();
      const created = await Course.create({ ...validCreateInput, createdBy: adminId });

      const updated = await coursesService.updateCourse(created._id.toString(), {
        detailedDescription: 'A much longer write-up of what this course covers.',
      });

      expect((updated as unknown as { detailedDescription: string }).detailedDescription).toBe(
        'A much longer write-up of what this course covers.',
      );
    });

    it('merges partial pricing instead of overwriting it wholesale', async () => {
      const adminId = objectId();
      const created = await Course.create({ ...validCreateInput, createdBy: adminId });

      const updated = (await coursesService.updateCourse(created._id.toString(), {
        pricing: { quarterly: 200 },
      })) as unknown as { pricing: { monthly?: number; quarterly?: number } };

      expect(updated.pricing.monthly).toBe(70); // preserved
      expect(updated.pricing.quarterly).toBe(200); // merged in
    });

    it('rejects a pricing update that leaves the course with no price', async () => {
      const adminId = objectId();
      // Bypass the zod schema (Mongoose alone won't enforce "at least one
      // price") to get a course with already-empty pricing, since the merge
      // logic only ever adds to existing prices — it can never strip one out.
      const created = await Course.create({
        ...validCreateInput,
        pricing: {},
        createdBy: adminId,
      });

      await expect(
        coursesService.updateCourse(created._id.toString(), {
          pricing: {},
        }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('throws 404 for a missing course', async () => {
      await expect(
        coursesService.updateCourse(new Types.ObjectId().toString(), { title: 'x'.repeat(5) }),
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('updateCourseThumbnail', () => {
    it('destroys the old thumbnail before uploading the new one', async () => {
      const adminId = objectId();
      const created = await Course.create({
        ...validCreateInput,
        createdBy: adminId,
        thumbnailPublicId: 'old_public_id',
      });

      const file = { buffer: Buffer.from('fake-image') } as Express.Multer.File;
      const updated = await coursesService.updateCourseThumbnail(created._id.toString(), file);

      expect(cloudinaryMock.uploader.destroy).toHaveBeenCalledWith('old_public_id', { resource_type: 'image' });
      expect(uploadBuffer).toHaveBeenCalledTimes(1);
      expect(updated.thumbnailUrl).toBe('https://cdn.example.com/mock-upload');
    });

    it('throws 404 for a missing course', async () => {
      const file = { buffer: Buffer.from('fake-image') } as Express.Multer.File;
      await expect(
        coursesService.updateCourseThumbnail(new Types.ObjectId().toString(), file),
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('deleteCourse', () => {
    it('deletes the course', async () => {
      const adminId = objectId();
      const created = await Course.create({ ...validCreateInput, createdBy: adminId });

      await coursesService.deleteCourse(created._id.toString());

      expect(await Course.findById(created._id)).toBeNull();
    });

    it('throws 404 for a missing course', async () => {
      await expect(coursesService.deleteCourse(new Types.ObjectId().toString())).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });

  describe('togglePublish', () => {
    it('flips isPublished', async () => {
      const adminId = objectId();
      const created = await Course.create({ ...validCreateInput, createdBy: adminId, isPublished: false });

      const toggled = await coursesService.togglePublish(created._id.toString());
      expect(toggled.isPublished).toBe(true);
    });
  });

  describe('setCoursePaymentsPaused', () => {
    it('pauses and resumes payments without touching isPublished', async () => {
      const adminId = objectId();
      const created = await Course.create({ ...validCreateInput, createdBy: adminId, isPublished: true });

      const paused = await coursesService.setCoursePaymentsPaused(created._id.toString(), true);
      expect(paused.paymentsPaused).toBe(true);
      expect(paused.isPublished).toBe(true);

      const resumed = await coursesService.setCoursePaymentsPaused(created._id.toString(), false);
      expect(resumed.paymentsPaused).toBe(false);
    });

    it('throws 404 for a missing course', async () => {
      await expect(
        coursesService.setCoursePaymentsPaused(new Types.ObjectId().toString(), true),
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('public reads', () => {
    it('getAllPublished only returns published courses', async () => {
      const adminId = objectId();
      await Course.create({ ...validCreateInput, createdBy: adminId, isPublished: true });
      await Course.create({ ...validCreateInput, createdBy: adminId, isPublished: false });

      const published = await coursesService.getAllPublished();
      expect(published).toHaveLength(1);
    });

    it('a course with payments paused remains visible in the public list', async () => {
      const adminId = objectId();
      await Course.create({ ...validCreateInput, createdBy: adminId, isPublished: true, paymentsPaused: true });

      const published = await coursesService.getAllPublished();
      expect(published).toHaveLength(1);
      expect((published[0] as unknown as { paymentsPaused: boolean }).paymentsPaused).toBe(true);
    });

    it('getCourseById includes detailedDescription when set', async () => {
      const adminId = objectId();
      const created = await Course.create({
        ...validCreateInput,
        createdBy: adminId,
        isPublished: true,
        detailedDescription: 'A much longer write-up of what this course covers.',
      });

      const found = await coursesService.getCourseById(created._id.toString());
      expect(found.detailedDescription).toBe('A much longer write-up of what this course covers.');
    });

    it('getCourseById 404s for an unpublished course', async () => {
      const adminId = objectId();
      const created = await Course.create({ ...validCreateInput, createdBy: adminId, isPublished: false });

      await expect(coursesService.getCourseById(created._id.toString())).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });

  describe('admin reads', () => {
    it('getAllCoursesAdmin includes unpublished courses', async () => {
      const adminId = objectId();
      await Course.create({ ...validCreateInput, createdBy: adminId, isPublished: false });

      const result = await coursesService.getAllCoursesAdmin({ page: 1, limit: 20 });
      expect(result.total).toBe(1);
    });

    it('getCourseByIdAdmin throws 404 for a missing course', async () => {
      await expect(
        coursesService.getCourseByIdAdmin(new Types.ObjectId().toString()),
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });
});
