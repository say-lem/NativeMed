import { Router } from 'express';
import { authenticate } from '../../../shared/middleware/authenticate';
import { authorize } from '../../../shared/middleware/authorize';
import { validate } from '../../../shared/middleware/validate';
import {
  updateHomepageStatsSchema,
  createYoutubeLinkSchema,
  updateYoutubeLinkSchema,
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

export default router;
