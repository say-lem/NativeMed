import { Types } from 'mongoose';
import * as homepageService from './homepage.service';
import { HomepageSettings } from '../model/homepage.model';
import { MockCase } from '../../cases/model/cases.model';
import { objectId } from '../../../../tests/helpers/factories';

const baseCaseFields = (overrides: Record<string, unknown> = {}) => ({
  stationNumber: 1,
  title: 'Abnormal LFTs',
  consultationType: 'Video Consultation',
  specialty: 'Gastroenterology',
  difficulty: 'medium' as const,
  isPublished: true,
  createdBy: objectId(),
  patientData: {
    name: 'John Smith',
    age: 45,
    gender: 'male' as const,
    pastMedicalHistory: [],
    drugHistory: [],
    recentConsultation: { seenBy: 'Dr Lee', notes: 'Routine bloods' },
    bloodTestResults: { summary: 'Mildly elevated ALT', rows: [] },
  },
  patientStory: 'Patient presents with fatigue.',
  markingScheme: [],
  exampleExplanation: 'Explain the likely cause.',
  management: [],
  learningPoints: 'Fatty liver disease is a common cause.',
  furtherResources: [],
  ...overrides,
});

const validYoutubeLink = {
  title: 'Intro to Mock Exams',
  url: 'https://www.youtube.com/watch?v=abc123',
};

describe('homepage.service', () => {
  describe('getHomepageData', () => {
    it('returns default stats and an empty link list on first read', async () => {
      const data = await homepageService.getHomepageData();

      expect(data.caseNumber).toBe(0);
      expect(data.testimonialsCount).toBe(0);
      expect(data.registrarsCount).toBe(0);
      expect(data.youtubeLinks).toEqual([]);
    });

    it('computes caseNumber live from published cases only', async () => {
      await MockCase.create(baseCaseFields({ stationNumber: 1, isPublished: true }));
      await MockCase.create(baseCaseFields({ stationNumber: 2, isPublished: true }));
      await MockCase.create(baseCaseFields({ stationNumber: 3, isPublished: false }));

      const data = await homepageService.getHomepageData();
      expect(data.caseNumber).toBe(2);
    });

    it('reflects admin-entered testimonials/registrars counts', async () => {
      await homepageService.updateHomepageStats({ testimonialsCount: 42, registrarsCount: 100 });

      const data = await homepageService.getHomepageData();
      expect(data.testimonialsCount).toBe(42);
      expect(data.registrarsCount).toBe(100);
    });

    it('returns youtube links sorted by order', async () => {
      await homepageService.addYoutubeLink({ ...validYoutubeLink, title: 'Second', order: 2 });
      await homepageService.addYoutubeLink({ ...validYoutubeLink, title: 'First', order: 1 });

      const data = await homepageService.getHomepageData();
      expect(data.youtubeLinks.map((l) => l.title)).toEqual(['First', 'Second']);
    });
  });

  describe('updateHomepageStats', () => {
    it('creates the singleton settings document if none exists', async () => {
      expect(await HomepageSettings.countDocuments()).toBe(0);

      await homepageService.updateHomepageStats({ testimonialsCount: 5 });

      expect(await HomepageSettings.countDocuments()).toBe(1);
    });

    it('never creates a second settings document on repeated updates', async () => {
      await homepageService.updateHomepageStats({ testimonialsCount: 5 });
      await homepageService.updateHomepageStats({ registrarsCount: 10 });

      expect(await HomepageSettings.countDocuments()).toBe(1);
    });

    it('only updates the fields provided', async () => {
      await homepageService.updateHomepageStats({ testimonialsCount: 5, registrarsCount: 10 });
      const updated = await homepageService.updateHomepageStats({ testimonialsCount: 7 });

      expect(updated.testimonialsCount).toBe(7);
      expect(updated.registrarsCount).toBe(10);
    });
  });

  describe('youtube links', () => {
    it('adds a link to the singleton document', async () => {
      const settings = await homepageService.addYoutubeLink(validYoutubeLink);

      expect(settings.youtubeLinks).toHaveLength(1);
      expect(settings.youtubeLinks[0].title).toBe(validYoutubeLink.title);
    });

    it('updates a link by id', async () => {
      const settings = await homepageService.addYoutubeLink(validYoutubeLink);
      const linkId = settings.youtubeLinks[0]._id.toString();

      const updated = await homepageService.updateYoutubeLink(linkId, { title: 'Renamed' });
      expect(updated.youtubeLinks[0].title).toBe('Renamed');
      expect(updated.youtubeLinks[0].url).toBe(validYoutubeLink.url);
    });

    it('throws 404 updating a missing link', async () => {
      await homepageService.addYoutubeLink(validYoutubeLink);

      await expect(
        homepageService.updateYoutubeLink(new Types.ObjectId().toString(), { title: 'Nope' }),
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it('deletes a link by id', async () => {
      const settings = await homepageService.addYoutubeLink(validYoutubeLink);
      const linkId = settings.youtubeLinks[0]._id.toString();

      const updated = await homepageService.deleteYoutubeLink(linkId);
      expect(updated.youtubeLinks).toHaveLength(0);
    });

    it('throws 404 deleting a missing link', async () => {
      await homepageService.addYoutubeLink(validYoutubeLink);

      await expect(
        homepageService.deleteYoutubeLink(new Types.ObjectId().toString()),
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });
});
