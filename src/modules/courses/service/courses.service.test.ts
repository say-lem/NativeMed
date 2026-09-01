jest.mock('../../../config/cloudinary', () => require('../../../../tests/mocks/cloudinary.mock'));

import { Types } from 'mongoose';
import * as coursesService from './courses.service';
import { Course } from '../model/courses.model';
import { cloudinaryMock, uploadBuffer } from '../../../../tests/mocks/cloudinary.mock';
import { objectId } from '../../../../tests/helpers/factories';

const validCreateInput = {
  title: 'MRCGP CSA Prep',
  description: 'A full prep course for the CSA exam.',
  pricing: {
    mocksessions_only: { monthly: 40 },
    mocksession_and_lectures: { monthly: 70 },
  },
  lecturesDriveFolderId: 'drive-lectures-id',
  mockSessionsDriveFolderId: 'drive-mocks-id',
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
    it('throws when a tier has no price at all', () => {
      expect(() =>
        coursesService.assertCourseHasPricing({
          mocksessions_only: {},
          mocksession_and_lectures: { monthly: 10 },
        }),
      ).toThrow(/mocksessions_only/);
    });

    it('passes when every tier has at least one price', () => {
      expect(() =>
        coursesService.assertCourseHasPricing({
          mocksessions_only: { quarterly: 100 },
          mocksession_and_lectures: { monthly: 10 },
        }),
      ).not.toThrow();
    });
  });

  describe('updateCourse', () => {
    it('merges partial tier pricing instead of overwriting the whole tier', async () => {
      const adminId = objectId();
      const created = await Course.create({ ...validCreateInput, createdBy: adminId });

      const updated = (await coursesService.updateCourse(created._id.toString(), {
        pricing: { mocksessions_only: { quarterly: 100 } },
      })) as unknown as { pricing: { mocksessions_only: { monthly?: number; quarterly?: number } } };

      expect(updated.pricing.mocksessions_only.monthly).toBe(40); // preserved
      expect(updated.pricing.mocksessions_only.quarterly).toBe(100); // merged in
    });

    it('rejects a pricing update that leaves a tier with no price', async () => {
      const adminId = objectId();
      // Bypass the zod schema (Mongoose alone won't enforce "at least one
      // price") to get a course with an already-empty tier, since the merge
      // logic only ever adds to existing prices — it can never strip one out.
      const created = await Course.create({
        ...validCreateInput,
        pricing: { mocksessions_only: {}, mocksession_and_lectures: { monthly: 70 } },
        createdBy: adminId,
      });

      await expect(
        coursesService.updateCourse(created._id.toString(), {
          pricing: { mocksession_and_lectures: { quarterly: 200 } },
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

  describe('public reads', () => {
    it('getAllPublished only returns published courses', async () => {
      const adminId = objectId();
      await Course.create({ ...validCreateInput, createdBy: adminId, isPublished: true });
      await Course.create({ ...validCreateInput, createdBy: adminId, isPublished: false });

      const published = await coursesService.getAllPublished();
      expect(published).toHaveLength(1);
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
