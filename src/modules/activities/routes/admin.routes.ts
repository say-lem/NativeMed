import { Router } from 'express';
import { authenticate } from '../../../shared/middleware/authenticate';
import { authorize } from '../../../shared/middleware/authorize';
import { validate } from '../../../shared/middleware/validate';
import { createActivitySchema } from '../schema/activities.schema';
import * as activitiesController from '../controller/activities.controller';

const router = Router();
router.use(authenticate, authorize('admin'));

// Post a new activity — date + description
router.post('/', validate(createActivitySchema), activitiesController.createActivity);

export default router;
