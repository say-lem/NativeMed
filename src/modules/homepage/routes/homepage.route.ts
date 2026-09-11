import { Router } from 'express';
import * as homepageController from '../controller/homepage.controller';

const router = Router();

// Open endpoint — caseNumber (live), testimonialsCount, registrarsCount and
// youtubeLinks for the public homepage.
router.get('/', homepageController.getHomepageData);

export default router;
