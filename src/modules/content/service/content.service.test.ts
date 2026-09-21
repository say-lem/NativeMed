jest.mock('../../../config/cloudinary', () => require('../../../../tests/mocks/cloudinary.mock'));

import { Types } from 'mongoose';
import * as contentService from './content.service';
import * as enrollmentsService from '../../enrollments/service/enrollments.service';
import * as liveCoursesService from '../../liveCourses/service/liveCourses.service';
import { CourseContent } from '../model/content.model';
import { cloudinaryMock, uploadBufferLarge } from '../../../../tests/mocks/cloudinary.mock';
import {
  createTestUser,
  createTestCourse,
  createTestLiveCourse,
  objectId,
} from '../../../../tests/helpers/factories';

describe('content.service', () => {
  beforeEach(() => {
    uploadBufferLarge.mockClear();
    cloudinaryMock.uploader.destroy.mockClear();
    cloudinaryMock.utils.private_download_url.mockClear();
  });

  describe('uploadPdf', () => {
    it('uploads to Cloudinary as an authenticated raw asset and stores the content record', async () => {
      const course = await createTestCourse(objectId());
      const file = { buffer: Buffer.from('pdf') } as Express.Multer.File;

      const content = await contentService.uploadPdf(
        course._id.toString(),
        { title: 'Lecture Notes', order: 1, type: 'pdf' },
        file,
      );

      expect(content.type).toBe('pdf');
      expect(content.fileUrl).toBe('https://cdn.example.com/mock-upload');
      expect(uploadBufferLarge).toHaveBeenCalledWith(
        file.buffer,
        expect.objectContaining({ resource_type: 'raw', type: 'authenticated' }),
      );
    });

    it('throws 404 for a missing course', async () => {
      const file = { buffer: Buffer.from('pdf') } as Express.Multer.File;
      await expect(
        contentService.uploadPdf(new Types.ObjectId().toString(), { title: 'x', order: 0, type: 'pdf' }, file),
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('addDriveLink', () => {
    it('creates a content record pointing at the Drive link, no Cloudinary involved', async () => {
      const course = await createTestCourse(objectId());

      const content = await contentService.addDriveLink(course._id.toString(), {
        title: 'Lecture 1',
        type: 'video',
        fileUrl: 'https://drive.google.com/file/d/abc123/view',
        order: 0,
      });

      expect(content.fileUrl).toBe('https://drive.google.com/file/d/abc123/view');
      expect(uploadBufferLarge).not.toHaveBeenCalled();
    });
  });

  describe('updateContent / deleteContent', () => {
    it('updates metadata only', async () => {
      const course = await createTestCourse(objectId());
      const content = await CourseContent.create({
        courseId: course._id,
        title: 'Old title',
        type: 'video',
        fileUrl: 'https://drive.google.com/x',
        order: 0,
      });

      const updated = await contentService.updateContent(content._id.toString(), { title: 'New title' });
      expect(updated.title).toBe('New title');
    });

    it('throws 404 when updating missing content', async () => {
      await expect(
        contentService.updateContent(new Types.ObjectId().toString(), { title: 'x' }),
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it('deleting a pdf also destroys the Cloudinary asset', async () => {
      const course = await createTestCourse(objectId());
      const content = await CourseContent.create({
        courseId: course._id,
        title: 'PDF',
        type: 'pdf',
        fileUrl: 'https://cdn.example.com/x',
        publicId: 'pdf_public_id',
        order: 0,
      });

      await contentService.deleteContent(content._id.toString());

      expect(cloudinaryMock.uploader.destroy).toHaveBeenCalledWith('pdf_public_id', {
        resource_type: 'raw',
        type: 'authenticated',
      });
      expect(await CourseContent.findById(content._id)).toBeNull();
    });

    it('deleting a video leaves Cloudinary untouched', async () => {
      const course = await createTestCourse(objectId());
      const content = await CourseContent.create({
        courseId: course._id,
        title: 'Video',
        type: 'video',
        fileUrl: 'https://drive.google.com/x',
        order: 0,
      });

      await contentService.deleteContent(content._id.toString());
      expect(cloudinaryMock.uploader.destroy).not.toHaveBeenCalled();
    });
  });

  describe('access-gated reads', () => {
    it('admins can read any course content', async () => {
      const course = await createTestCourse(objectId());
      await CourseContent.create({ courseId: course._id, title: 'x', type: 'video', fileUrl: 'https://drive/x', order: 0 });

      const contents = await contentService.getCourseContents(course._id.toString(), objectId(), 'admin');
      expect(contents).toHaveLength(1);
    });

    it('the course owner can read their own course content', async () => {
      const owner = await createTestUser();
      const course = await createTestCourse(owner._id);
      await CourseContent.create({ courseId: course._id, title: 'x', type: 'video', fileUrl: 'https://drive/x', order: 0 });

      const contents = await contentService.getCourseContents(course._id.toString(), owner._id, 'user');
      expect(contents).toHaveLength(1);
    });

    it('an enrolled user can read course content', async () => {
      const course = await createTestCourse(objectId());
      const user = await createTestUser();
      await enrollmentsService.createEnrollment(user._id, course._id.toString(), objectId());
      await CourseContent.create({ courseId: course._id, title: 'x', type: 'video', fileUrl: 'https://drive/x', order: 0 });

      const contents = await contentService.getCourseContents(course._id.toString(), user._id, 'user');
      expect(contents).toHaveLength(1);
    });

    it('an unenrolled user is rejected with 403', async () => {
      const course = await createTestCourse(objectId());
      const user = await createTestUser();

      await expect(
        contentService.getCourseContents(course._id.toString(), user._id, 'user'),
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    it('throws 404 for a non-existent course', async () => {
      await expect(
        contentService.getCourseContents(new Types.ObjectId().toString(), objectId(), 'user'),
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it('re-signs the PDF delivery URL fresh on every read', async () => {
      const course = await createTestCourse(objectId());
      const user = await createTestUser();
      await enrollmentsService.createEnrollment(user._id, course._id.toString(), objectId());
      const content = await CourseContent.create({
        courseId: course._id,
        title: 'PDF',
        type: 'pdf',
        fileUrl: 'https://stale.example.com/old-signed-url',
        publicId: 'pdf_public_id',
        order: 0,
      });

      const found = await contentService.getContentById(content._id.toString(), user._id, 'user');

      expect(found.fileUrl).toBe('https://signed.example.com/mock-download');
      expect(cloudinaryMock.utils.private_download_url).toHaveBeenCalledWith('pdf_public_id', '', {
        resource_type: 'raw',
        type: 'authenticated',
      });
    });
  });

  describe('live courses (courseType: LiveCourse)', () => {
    it('uploadPdf / addDriveLink / getCourseContents scope to the live course, not a normal one', async () => {
      const admin = await createTestUser({ role: 'admin' });
      const liveCourse = await createTestLiveCourse(admin._id);
      const file = { buffer: Buffer.from('pdf') } as Express.Multer.File;

      await contentService.uploadPdf(
        liveCourse._id.toString(),
        { title: 'Live PDF', order: 0, type: 'pdf' },
        file,
        'LiveCourse',
      );
      await contentService.addDriveLink(
        liveCourse._id.toString(),
        { title: 'Live Recording', type: 'video', fileUrl: 'https://drive.google.com/live', order: 1 },
        'LiveCourse',
      );

      const contents = await contentService.getCourseContents(
        liveCourse._id.toString(),
        admin._id,
        'admin',
        'LiveCourse',
      );
      expect(contents).toHaveLength(2);
    });

    it('an enrolled user can read live course content; an unenrolled one is rejected', async () => {
      const admin = await createTestUser({ role: 'admin' });
      const liveCourse = await createTestLiveCourse(admin._id);
      const enrolledUser = await createTestUser();
      const strangerUser = await createTestUser();
      await liveCoursesService.manualEnroll(enrolledUser._id.toString(), liveCourse._id.toString(), admin._id);
      await CourseContent.create({
        courseId: liveCourse._id,
        courseType: 'LiveCourse',
        title: 'x',
        type: 'video',
        fileUrl: 'https://drive/x',
        order: 0,
      });

      const contents = await contentService.getCourseContents(
        liveCourse._id.toString(),
        enrolledUser._id,
        'user',
        'LiveCourse',
      );
      expect(contents).toHaveLength(1);

      await expect(
        contentService.getCourseContents(liveCourse._id.toString(), strangerUser._id, 'user', 'LiveCourse'),
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    it('does not leak a live course content item into a normal course content list', async () => {
      const admin = await createTestUser({ role: 'admin' });
      const course = await createTestCourse(admin._id);
      const liveCourse = await createTestLiveCourse(admin._id);
      await CourseContent.create({
        courseId: liveCourse._id,
        courseType: 'LiveCourse',
        title: 'live item',
        type: 'video',
        fileUrl: 'https://drive/live',
        order: 0,
      });

      const contents = await contentService.getCourseContents(course._id.toString(), admin._id, 'admin');
      expect(contents).toHaveLength(0);
    });
  });
});
