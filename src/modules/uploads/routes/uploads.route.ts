import { Router } from 'express';
import { authenticate } from '../../../shared/middleware/authenticate';
import { authorize } from '../../../shared/middleware/authorize';
import { validate } from '../../../shared/middleware/validate';
import { pdfUploadSignatureSchema } from '../schema/uploads.schema';
import * as uploadsController from '../controller/uploads.controller';

const router = Router();
router.use(authenticate, authorize('admin'));

// Admin requests a short-lived signature, then uploads the PDF directly from
// the browser to Cloudinary with it — see uploads.service.ts.
router.post('/pdf-signature', validate(pdfUploadSignatureSchema), uploadsController.createPdfUploadSignature);

export default router;
