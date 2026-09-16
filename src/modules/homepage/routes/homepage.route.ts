import { Router } from 'express';
import * as homepageController from '../controller/homepage.controller';

const router = Router();

// Open endpoint — caseNumber (live), testimonialsCount, registrarsCount and
// youtubeLinks for the public homepage.
router.get('/', homepageController.getHomepageData);

// Own endpoint, separate from the general homepage feed above.
router.get('/terms', homepageController.getTermsAndConditions);
router.get('/legal-disclaimer', homepageController.getLegalDisclaimer);
router.get('/privacy-policy', homepageController.getPrivacyPolicy);
router.get('/founder-bio', homepageController.getFounderBio);
router.get('/faqs', homepageController.getFaqs);

export default router;
