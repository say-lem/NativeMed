import { Router } from 'express';
import { authenticate } from '../../../shared/middleware/authenticate';
import { authorize } from '../../../shared/middleware/authorize';
import { validate } from '../../../shared/middleware/validate';
import { createActivitySchema, updateActivitySchema } from '../schema/activities.schema';
import * as activitiesController from '../controller/activities.controller';

const router = Router();
router.use(authenticate, authorize('admin'));

// Post a new activity — date + description
router.post('/', validate(createActivitySchema), activitiesController.createActivity);

// Edit an existing activity
router.patch('/:activityId', validate(updateActivitySchema), activitiesController.updateActivity);

// Delete an activity
router.delete('/:activityId', activitiesController.deleteActivity);

export default router;
