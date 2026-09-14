jest.mock('../../../config/cloudinary', () => require('../../../../tests/mocks/cloudinary.mock'));

import { Types } from 'mongoose';
import * as casesService from './cases.service';
import { MockCase } from '../model/cases.model';
import { Subscription } from '../../subscriptions/model/subscriptions.model';
import { cloudinaryMock, uploadBuffer } from '../../../../tests/mocks/cloudinary.mock';
import { objectId } from '../../../../tests/helpers/factories';

const baseCaseFields = (overrides: Record<string, unknown> = {}) => ({
  stationNumber: 1,
  title: 'Abnormal LFTs',
  consultationType: 'Video Consultation',
  specialty: 'Gastroenterology',
  difficulty: 'medium' as const,
  isPublished: true,
  patientData: {
    name: 'John Smith',
    age: 45,
    gender: 'male' as const,
    pastMedicalHistory: ['Type 2 Diabetes'],
    drugHistory: ['Metformin'],
    recentConsultation: { seenBy: 'Dr Lee', notes: 'Routine bloods' },
    bloodTestResults: { summary: 'Mildly elevated ALT', rows: [] },
  },
  patientStory: 'Patient presents with fatigue.',
  markingScheme: [{ heading: 'Data Gathering', points: ['Ask about alcohol intake'] }],
  exampleExplanation: 'Explain the likely cause of the abnormal results.',
  management: ['Repeat LFTs in 6 weeks'],
  learningPoints: 'Fatty liver disease is a common cause of mildly deranged LFTs.',
  furtherResources: [],
  ...overrides,
});

const filterParams = { page: 1, limit: 20 } as never;

const grantCaseBankAccess = async (userId: Types.ObjectId) =>
  Subscription.create({
    userId,
    type: 'case_bank',
    billingInterval: 'monthly',
    status: 'active',
    stripeCustomerId: 'manual_cus_test',
    stripeSubscriptionId: `manual_sub_test_${userId.toString()}`,
    currentPeriodStart: new Date(),
    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });

describe('cases.service', () => {
  beforeEach(() => {
    uploadBuffer.mockClear();
    cloudinaryMock.uploader.destroy.mockClear();
  });

  describe('free preview gating', () => {
    const seedSixPublishedCases = async () => {
      for (let i = 1; i <= 6; i++) {
        await MockCase.create({ ...baseCaseFields({ stationNumber: i, title: `Case ${i}` }), createdBy: objectId() });
      }
    };

    it('non-subscribed users only see the first 5 cases by station order', async () => {
      await seedSixPublishedCases();
      const userId = objectId();

      const result = await casesService.getPublishedCases(filterParams, userId, 'user');
      expect(result.total).toBe(5);
    });

    it('subscribed users see every published case', async () => {
      await seedSixPublishedCases();
      const userId = objectId();
      await grantCaseBankAccess(userId);

      const result = await casesService.getPublishedCases(filterParams, userId, 'user');
      expect(result.total).toBe(6);
    });

    it('admins see every published case regardless of subscription', async () => {
      await seedSixPublishedCases();
      const result = await casesService.getPublishedCases(filterParams, objectId(), 'admin');
      expect(result.total).toBe(6);
    });

    it('detail access is 403 for a non-preview case without a subscription', async () => {
      await seedSixPublishedCases();
      const sixthCase = await MockCase.findOne({ stationNumber: 6 });
      const userId = objectId();

      await expect(
        casesService.getPublishedCaseById(sixthCase!._id.toString(), userId, 'user'),
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    it('detail access succeeds for a preview case without a subscription', async () => {
      await seedSixPublishedCases();
      const firstCase = await MockCase.findOne({ stationNumber: 1 });
      const userId = objectId();

      const found = await casesService.getPublishedCaseById(firstCase!._id.toString(), userId, 'user');
      expect(found.title).toBe('Case 1');
    });

    it('anonymous visitors (no userId/role) only see the first 5 cases, same as an unsubscribed user', async () => {
      await seedSixPublishedCases();

      const result = await casesService.getPublishedCases(filterParams);
      expect(result.total).toBe(5);
    });

    it('anonymous visitors can view a free preview case by id', async () => {
      await seedSixPublishedCases();
      const firstCase = await MockCase.findOne({ stationNumber: 1 });

      const found = await casesService.getPublishedCaseById(firstCase!._id.toString());
      expect(found.title).toBe('Case 1');
    });

    it('anonymous visitors get 403 on a non-preview case', async () => {
      await seedSixPublishedCases();
      const sixthCase = await MockCase.findOne({ stationNumber: 6 });

      await expect(
        casesService.getPublishedCaseById(sixthCase!._id.toString()),
      ).rejects.toMatchObject({ statusCode: 403 });
    });
  });

  describe('getPublishedCaseById', () => {
    it('throws 404 for an unpublished case even with access', async () => {
      const mockCase = await MockCase.create({ ...baseCaseFields({ isPublished: false }), createdBy: objectId() });
      const userId = objectId();
      await grantCaseBankAccess(userId);

      await expect(
        casesService.getPublishedCaseById(mockCase._id.toString(), userId, 'user'),
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('getPublishedSpecialties', () => {
    it('groups published cases by specialty', async () => {
      await MockCase.create({ ...baseCaseFields({ specialty: 'Cardiology' }), createdBy: objectId() });
      await MockCase.create({ ...baseCaseFields({ specialty: 'Cardiology', stationNumber: 2 }), createdBy: objectId() });
      await MockCase.create({ ...baseCaseFields({ specialty: 'Dermatology', stationNumber: 3 }), createdBy: objectId() });

      const specialties = await casesService.getPublishedSpecialties(objectId(), 'admin');
      const cardiology = specialties.find((s) => s.specialty === 'Cardiology');
      expect(cardiology?.count).toBe(2);
    });
  });

  describe('createCase', () => {
    it('creates a case without image uploads', async () => {
      const created = await casesService.createCase(baseCaseFields() as never, objectId());
      expect(created?.title).toBe('Abnormal LFTs');
      expect(uploadBuffer).not.toHaveBeenCalled();
    });

    it('uploads the cover image when provided', async () => {
      const file = { buffer: Buffer.from('img') } as Express.Multer.File;
      const created = await casesService.createCase(baseCaseFields() as never, objectId(), file);
      expect(uploadBuffer).toHaveBeenCalledTimes(1);
      expect(created?.imageUrl).toBe('https://cdn.example.com/mock-upload');
    });
  });

  describe('updateCaseImage', () => {
    it('destroys the old image before uploading the new one', async () => {
      const mockCase = await MockCase.create({
        ...baseCaseFields(),
        imagePublicId: 'old_image_id',
        createdBy: objectId(),
      });
      const file = { buffer: Buffer.from('img') } as Express.Multer.File;

      await casesService.updateCaseImage(mockCase._id.toString(), file);

      expect(cloudinaryMock.uploader.destroy).toHaveBeenCalledWith('old_image_id', { resource_type: 'image' });
    });

    it('throws 404 for a missing case', async () => {
      const file = { buffer: Buffer.from('img') } as Express.Multer.File;
      await expect(
        casesService.updateCaseImage(new Types.ObjectId().toString(), file),
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('updateCase', () => {
    it('merges nested patientData without wiping sibling fields', async () => {
      const mockCase = await MockCase.create({ ...baseCaseFields(), createdBy: objectId() });

      const updated = await casesService.updateCase(mockCase._id.toString(), {
        patientData: { age: 50 },
      } as never);

      expect(updated.patientData.age).toBe(50);
      expect(updated.patientData.name).toBe('John Smith'); // untouched
    });

    it('throws 404 for a missing case', async () => {
      await expect(
        casesService.updateCase(new Types.ObjectId().toString(), { title: 'x' } as never),
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('deleteCase', () => {
    it('deletes the case and its Cloudinary assets', async () => {
      const mockCase = await MockCase.create({
        ...baseCaseFields(),
        imagePublicId: 'img_id',
        stationImagePublicId: 'station_img_id',
        createdBy: objectId(),
      });

      await casesService.deleteCase(mockCase._id.toString());

      expect(cloudinaryMock.uploader.destroy).toHaveBeenCalledTimes(2);
      expect(await MockCase.findById(mockCase._id)).toBeNull();
    });
  });

  describe('togglePublish', () => {
    it('flips isPublished', async () => {
      const mockCase = await MockCase.create({ ...baseCaseFields({ isPublished: true }), createdBy: objectId() });
      const toggled = await casesService.togglePublish(mockCase._id.toString());
      expect(toggled.isPublished).toBe(false);
    });
  });

  describe('duplicateCase', () => {
    it('creates a draft copy with the next station number and no carried-over images', async () => {
      const original = await MockCase.create({
        ...baseCaseFields({ stationNumber: 3, isPublished: true }),
        imageUrl: 'https://cdn.example.com/original.jpg',
        imagePublicId: 'original_public_id',
        createdBy: objectId(),
      });
      await MockCase.create({ ...baseCaseFields({ stationNumber: 7 }), createdBy: objectId() });

      const adminId = objectId();
      const duplicate = await casesService.duplicateCase(original._id.toString(), adminId);

      expect(duplicate.title).toBe(`Copy of ${original.title}`);
      expect(duplicate.stationNumber).toBe(8);
      expect(duplicate.isPublished).toBe(false);
      expect(duplicate.imageUrl).toBeUndefined();
      expect(duplicate.createdBy.toString()).toBe(adminId.toString());
    });

    it('throws 404 for a missing case', async () => {
      await expect(
        casesService.duplicateCase(new Types.ObjectId().toString(), objectId()),
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('getAllCasesAdmin', () => {
    it('includes drafts', async () => {
      await MockCase.create({ ...baseCaseFields({ isPublished: false }), createdBy: objectId() });
      const result = await casesService.getAllCasesAdmin(filterParams);
      expect(result.total).toBe(1);
    });
  });

  describe('getCaseByIdAdmin', () => {
    it('throws 404 for a missing case', async () => {
      await expect(
        casesService.getCaseByIdAdmin(new Types.ObjectId().toString()),
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });
});
