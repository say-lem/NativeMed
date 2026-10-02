import { Router } from 'express';
import { authenticate } from '../../../shared/middleware/authenticate';
import { authorize } from '../../../shared/middleware/authorize';
import { validate } from '../../../shared/middleware/validate';
import {
  createLinkFreeProductSchema,
  uploadPdfFreeProductSchema,
  registerPdfFreeProductSchema,
  uploadBlogFreeProductSchema,
  updateFreeProductSchema,
} from '../schema/freeProducts.schema';
import {
  uploadPdf as uploadPdfMiddleware,
  uploadCoverImage as uploadCoverImageMiddleware,
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

// PDF product — direct-upload variant: admin already uploaded the file to
// Cloudinary from the browser (see uploads.route.ts) and is just registering
// the resulting asset here.
router.post('/pdf-link', validate(registerPdfFreeProductSchema), freeProductsController.registerPdfProduct);

// Blog product — cover image upload + written content. Expected to be the
// common case; link/pdf remain for the minority that's just pointer material.
router.post(
  '/upload-blog',
  uploadRateLimiterMiddleware,
  concurrencyGuardMiddleware,
  uploadCoverImageMiddleware.single('coverImage'),
  validate(uploadBlogFreeProductSchema),
  freeProductsController.uploadBlogProduct,
);

router.patch('/:productId', validate(updateFreeProductSchema), freeProductsController.updateProduct);

// Replace a blog's cover image in place (destroy-then-upload, see service)
router.patch(
  '/:productId/cover-image',
  uploadRateLimiterMiddleware,
  concurrencyGuardMiddleware,
  uploadCoverImageMiddleware.single('coverImage'),
  freeProductsController.replaceCoverImage,
);

router.patch('/:productId/publish', freeProductsController.publishProduct);
router.patch('/:productId/unpublish', freeProductsController.unpublishProduct);
router.patch('/:productId/archive', freeProductsController.unpublishProduct);
router.delete('/:productId', freeProductsController.deleteProduct);

export default router;
