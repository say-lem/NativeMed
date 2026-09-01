import { Types } from 'mongoose';
import * as activitiesService from './activities.service';
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
