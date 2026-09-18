import * as catalogService from './catalog.service';
import * as caseBankOverviewService from '../../cases/service/caseBankOverview.service';
import { BookingProduct } from '../../booking/model/booking.model';
import { MockCase } from '../../cases/model/cases.model';
import { CASE_BANK_PLAN } from '../../subscriptions/constants/plans';
import { createTestCourse, createTestLiveCourse, objectId } from '../../../../tests/helpers/factories';

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

describe('catalog.service', () => {
  describe('getAllProducts', () => {
    it('always includes the case bank as a product, even with no other data', async () => {
      const products = await catalogService.getAllProducts();

      const caseBank = products.find((p) => p.type === 'case_bank');
      expect(caseBank).toBeDefined();
      expect(caseBank).toMatchObject({
        title: 'Case Bank Access', // CaseBankOverview default, before any admin edit
        prices: CASE_BANK_PLAN.prices,
        caseCount: 0,
        imageUrl: null,
      });
    });

    it('reflects the admin-editable case bank overview (title/description/image)', async () => {
      await caseBankOverviewService.updateCaseBankOverview({
        title: 'MRCGP Case Bank',
        description: 'Practice with real exam-style clinical stations.',
      });

      const products = await catalogService.getAllProducts();
      const caseBank = products.find((p) => p.type === 'case_bank');
      expect(caseBank).toMatchObject({
        title: 'MRCGP Case Bank',
        description: 'Practice with real exam-style clinical stations.',
      });
    });

    it('reports the live count of published cases on the case bank product', async () => {
      await MockCase.create(baseCaseFields({ stationNumber: 1, isPublished: true }));
      await MockCase.create(baseCaseFields({ stationNumber: 2, isPublished: true }));
      await MockCase.create(baseCaseFields({ stationNumber: 3, isPublished: false }));

      const products = await catalogService.getAllProducts();
      const caseBank = products.find((p) => p.type === 'case_bank');
      expect(caseBank).toMatchObject({ caseCount: 2 });
    });

    it('includes only published courses', async () => {
      const owner = objectId();
      await createTestCourse(owner, { title: 'Published Course', isPublished: true });
      await createTestCourse(owner, { title: 'Draft Course', isPublished: false });

      const products = await catalogService.getAllProducts();
      const courseProducts = products.filter((p) => p.type === 'course');

      expect(courseProducts).toHaveLength(1);
      expect(courseProducts[0]).toMatchObject({ title: 'Published Course' });
    });

    it('includes only published one-on-one booking products', async () => {
      await BookingProduct.create({
        title: 'Career Coaching',
        description: 'A one-on-one coaching session.',
        price: 50,
        isPublished: true,
        createdBy: objectId(),
      });
      await BookingProduct.create({
        title: 'Hidden Session',
        description: 'Not yet ready.',
        price: 30,
        isPublished: false,
        createdBy: objectId(),
      });

      const products = await catalogService.getAllProducts();
      const oneOnOneProducts = products.filter((p) => p.type === 'one_on_one');

      expect(oneOnOneProducts).toHaveLength(1);
      expect(oneOnOneProducts[0]).toMatchObject({ title: 'Career Coaching', price: 50 });
    });

    it('combines courses, live courses, one-on-one sessions, and the case bank into a single list', async () => {
      await createTestCourse(objectId(), { title: 'A Course', isPublished: true });
      await createTestLiveCourse(objectId(), { title: 'A Live Course', isPublished: true });
      await BookingProduct.create({
        title: 'A Session',
        description: 'A one-on-one session.',
        price: 20,
        isPublished: true,
        createdBy: objectId(),
      });

      const products = await catalogService.getAllProducts();
      const types = products.map((p) => p.type).sort();

      expect(types).toEqual(['case_bank', 'course', 'live_course', 'one_on_one']);
    });

    it('includes only published live courses', async () => {
      const owner = objectId();
      await createTestLiveCourse(owner, { title: 'Published Live Course', isPublished: true });
      await createTestLiveCourse(owner, { title: 'Draft Live Course', isPublished: false });

      const products = await catalogService.getAllProducts();
      const liveCourseProducts = products.filter((p) => p.type === 'live_course');

      expect(liveCourseProducts).toHaveLength(1);
      expect(liveCourseProducts[0]).toMatchObject({ title: 'Published Live Course' });
    });
  });
});
