import { Types } from 'mongoose';
import * as activitiesService from './activities.service';
import { createTestCourse, createTestLiveCourse } from '../../../../tests/helpers/factories';
import { createActivitySchema, updateActivitySchema } from '../schema/activities.schema';
import { BookingProduct } from '../../booking/model/booking.model';
import { FreeProduct } from '../../freeProducts/model/freeProducts.model';
import { Activity } from '../model/activities.model';

describe('activities.service', () => {
  describe('createActivity', () => {
    it('creates an activity attributed to the admin', async () => {
      const adminId = new Types.ObjectId();
      const activity = await activitiesService.createActivity(
        { date: new Date('2026-01-15'), description: 'Mock exam session for the January cohort' },
        adminId,
      );

      expect(activity.description).toContain('January cohort');
      expect(activity.createdBy.toString()).toBe(adminId.toString());
    });
  });

  describe('getAllActivities', () => {
    it('sorts newest-by-date first and paginates', async () => {
      const adminId = new Types.ObjectId();
      await Activity.create({ date: new Date('2026-01-01'), description: 'Older activity', createdBy: adminId });
      await Activity.create({ date: new Date('2026-02-01'), description: 'Newer activity', createdBy: adminId });

      const result = await activitiesService.getAllActivities(1, 20);

      expect(result.total).toBe(2);
      expect(result.items[0].description).toBe('Newer activity');
    });
  });

  describe('updateActivity', () => {
    it('updates the description', async () => {
      const activity = await Activity.create({
        date: new Date('2026-01-01'),
        description: 'Original',
        createdBy: new Types.ObjectId(),
      });

      const updated = await activitiesService.updateActivity(activity._id.toString(), {
        description: 'Updated description',
      });

      expect(updated.description).toBe('Updated description');
    });

    it('throws 404 for a missing activity', async () => {
      await expect(
        activitiesService.updateActivity(new Types.ObjectId().toString(), { description: 'x'.repeat(10) }),
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('deleteActivity', () => {
    it('deletes an existing activity', async () => {
      const activity = await Activity.create({
        date: new Date(),
        description: 'To be removed',
        createdBy: new Types.ObjectId(),
      });

      await activitiesService.deleteActivity(activity._id.toString());

      expect(await Activity.findById(activity._id)).toBeNull();
    });

    it('throws 404 for a missing activity', async () => {
      await expect(
        activitiesService.deleteActivity(new Types.ObjectId().toString()),
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });
});

describe('announcement fields and publishing', () => {
  it('persists event details, validates course links, and allows unlinking', async () => {
    const adminId = new Types.ObjectId();
    const course = await createTestCourse(adminId);
    const input = createActivitySchema.parse({
      date: '2026-09-10', description: 'Upcoming lecture', time: '14:30',
      activityType: 'Custom training', activityStatus: 'Upcoming', courseId: course.id,
    });
    const activity = await activitiesService.createActivity(input, adminId);
    const stored = await Activity.findById(activity.id);
    expect(stored).toMatchObject({ time: '14:30', activityType: 'Custom training', activityStatus: 'Upcoming' });
    expect(stored?.courseId?.toString()).toBe(course.id);
    await expect(activitiesService.updateActivity(activity.id, { courseId: new Types.ObjectId().toString() }))
      .rejects.toMatchObject({ statusCode: 404 });
    const updated = await activitiesService.updateActivity(activity.id, updateActivitySchema.parse({ courseId: null, time: '09:00' }));
    expect(updated.courseId).toBeNull();
    expect(updated.time).toBe('09:00');
  });

  it('hides archived announcements, keeps them in the admin list, and republishes them', async () => {
    const activity = await activitiesService.createActivity({ date: new Date(), description: 'An announcement' }, new Types.ObjectId());
    await activitiesService.setActivityPublished(activity.id, false);
    expect((await activitiesService.getAllActivities()).total).toBe(0);
    const adminList = await activitiesService.getAllActivities(1, 20, true);
    expect(adminList.total).toBe(1);
    expect(adminList.items[0].isPublished).toBe(false);
    await activitiesService.setActivityPublished(activity.id, true);
    expect((await activitiesService.getAllActivities()).total).toBe(1);
  });

  it('keeps legacy announcements visible', async () => {
    await Activity.collection.insertOne({ date: new Date(), description: 'Legacy announcement', createdBy: new Types.ObjectId() });
    expect((await activitiesService.getAllActivities()).total).toBe(1);
  });

  it.each([{ time: '25:00' }, { time: '12:60' }, { activityType: ' ' }, { courseId: 'invalid' }, { activityStatus: 123 }])('rejects invalid metadata %j', (fields) => {
    expect(updateActivitySchema.safeParse(fields).success).toBe(false);
  });
});


describe('product attachments', () => {
  it('attaches every product type, replaces links, and unlinks', async () => {
    const adminId = new Types.ObjectId();
    const course = await createTestCourse(adminId);
    const live = await createTestLiveCourse(adminId);
    const booking = await BookingProduct.create({ title: 'Session', description: 'A session', price: 50, createdBy: adminId });
    const free = await FreeProduct.create({ title: 'Resource', description: 'A resource', type: 'link', fileUrl: 'https://example.com', createdBy: adminId });
    for (const product of [
      { type: 'course', id: course.id }, { type: 'live_course', id: live.id },
      { type: 'one_on_one', id: booking.id }, { type: 'free_product', id: free.id },
      { type: 'case_bank' },
    ]) {
      const activity = await activitiesService.createActivity(createActivitySchema.parse({
        date: new Date(), description: 'Product announcement', product,
      }), adminId);
      const stored = await Activity.findById(activity.id);
      expect(stored?.product?.type).toBe(product.type);
      expect(stored?.product?.id?.toString()).toBe(product.id);
      const updated = await activitiesService.updateActivity(activity.id, { product: { type: 'course', id: course.id } });
      expect(updated.courseId?.toString()).toBe(course.id);
      await activitiesService.updateActivity(activity.id, { product: { type: 'case_bank' } });
      expect((await Activity.findById(activity.id))?.courseId).toBeNull();
      await activitiesService.updateActivity(activity.id, { product: null });
      expect((await Activity.findById(activity.id))?.product).toBeNull();
    }
  });

  it.each(['course', 'live_course', 'one_on_one', 'free_product'])('rejects missing %s products on create and update', async (type) => {
    const product = createActivitySchema.parse({ date: new Date(), description: 'Missing product', product: { type, id: new Types.ObjectId().toString() } });
    await expect(activitiesService.createActivity(product, new Types.ObjectId())).rejects.toMatchObject({ statusCode: 404 });
    const activity = await activitiesService.createActivity({ date: new Date(), description: 'Existing activity' }, new Types.ObjectId());
    await expect(activitiesService.updateActivity(activity.id, { product: product.product })).rejects.toMatchObject({ statusCode: 404 });
  });

  it('exposes legacy links as product attachments', async () => {
    const courseId = new Types.ObjectId();
    const activity = await Activity.create({ date: new Date(), description: 'Legacy activity', createdBy: new Types.ObjectId(), courseId });
    expect(activity.toJSON().product).toMatchObject({ type: 'course', id: courseId });
  });

  it.each([
    { product: { type: 'unknown' } }, { product: { type: 'course' } },
    { product: { type: 'live_course', id: 'bad' } },
    { product: { type: 'case_bank', id: new Types.ObjectId().toString() } },
    { product: null, courseId: null },
  ])('rejects invalid or conflicting attachments %j', (fields) => {
    expect(updateActivitySchema.safeParse(fields).success).toBe(false);
    expect(createActivitySchema.safeParse({ date: new Date(), description: 'Announcement', ...fields }).success).toBe(false);
  });
});
