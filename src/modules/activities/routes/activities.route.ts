import { Router } from 'express';
import * as activitiesController from '../controller/activities.controller';

const router = Router();

// Open endpoint — every user (and visitor) can see posted activities.
router.get('/', activitiesController.getAllActivities);

export default router;
