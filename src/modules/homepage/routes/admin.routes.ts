import { Router } from 'express';
import { authenticate } from '../../../shared/middleware/authenticate';
import { authorize } from '../../../shared/middleware/authorize';
import { validate } from '../../../shared/middleware/validate';
import {
  updateHomepageStatsSchema,
  createYoutubeLinkSchema,
  updateYoutubeLinkSchema,
  updateTermsAndConditionsSchema,
  updateLegalDisclaimerSchema,
} from '../schema/homepage.schema';
import * as homepageController from '../controller/homepage.controller';

const router = Router();
router.use(authenticate, authorize('admin'));

// Admin-entered stats — testimonialsCount / registrarsCount (caseNumber stays live-only)
router.patch('/', validate(updateHomepageStatsSchema), homepageController.updateHomepageStats);

// Admin-managed YouTube link list
router.post('/youtube-links', validate(createYoutubeLinkSchema), homepageController.addYoutubeLink);
router.patch('/youtube-links/:linkId', validate(updateYoutubeLinkSchema), homepageController.updateYoutubeLink);
router.delete('/youtube-links/:linkId', homepageController.deleteYoutubeLink);

// Terms and conditions — own endpoint. First PATCH creates it, later ones edit in place.
router.get('/terms', homepageController.getTermsAndConditions);
router.patch('/terms', validate(updateTermsAndConditionsSchema), homepageController.updateTermsAndConditions);

// Legal disclaimer — own endpoint, same create-on-first-PATCH pattern as terms.
router.get('/legal-disclaimer', homepageController.getLegalDisclaimer);
router.patch('/legal-disclaimer', validate(updateLegalDisclaimerSchema), homepageController.updateLegalDisclaimer);

export default router;
