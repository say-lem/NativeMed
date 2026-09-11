import { Router } from 'express';
import { authenticate } from '../../../shared/middleware/authenticate';
import { authorize } from '../../../shared/middleware/authorize';
import { validate } from '../../../shared/middleware/validate';
import {
  createLinkFreeProductSchema,
  uploadPdfFreeProductSchema,
  updateFreeProductSchema,
} from '../schema/freeProducts.schema';
import {
  uploadPdf as uploadPdfMiddleware,
  uploadRateLimiter as uploadRateLimiterMiddleware,
  concurrencyGuard as concurrencyGuardMiddleware,
} from '../upload/freeProducts.upload';
import * as freeProductsController from '../controller/freeProducts.controller';

const router = Router();
router.use(authenticate, authorize('admin'));

router.get('/', freeProductsController.getAllProducts);

// Link product — admin pastes a URL to the material
router.post('/', validate(createLinkFreeProductSchema), freeProductsController.createLinkProduct);

// PDF product — admin uploads the file directly (Cloudinary)
router.post(
  '/upload-pdf',
  uploadRateLimiterMiddleware,
  concurrencyGuardMiddleware,
  uploadPdfMiddleware.single('file'),
  validate(uploadPdfFreeProductSchema),
  freeProductsController.uploadPdfProduct,
);

router.patch('/:productId', validate(updateFreeProductSchema), freeProductsController.updateProduct);
router.patch('/:productId/publish', freeProductsController.publishProduct);
router.patch('/:productId/unpublish', freeProductsController.unpublishProduct);
router.patch('/:productId/archive', freeProductsController.unpublishProduct);
router.delete('/:productId', freeProductsController.deleteProduct);

export default router;
