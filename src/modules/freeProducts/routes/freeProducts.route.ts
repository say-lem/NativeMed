import { Router } from 'express';
import * as freeProductsController from '../controller/freeProducts.controller';

const router = Router();

// Fully open — no authenticate/authorize. Free products are public by design.
router.get('/', freeProductsController.getPublishedProducts);
router.get('/:productId', freeProductsController.getPublishedProductById);

export default router;
