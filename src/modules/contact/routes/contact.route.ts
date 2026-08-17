import { Router } from 'express';
import { validate } from '../../../shared/middleware/validate';
import { contactMessageSchema } from '../schema/contact.schema';
import * as contactController from '../controller/contact.controller';

const router = Router();

// Open endpoint — public contact form, no auth. Rate-limited in app.ts.
router.post('/', validate(contactMessageSchema), contactController.submitContactMessage);

export default router;
