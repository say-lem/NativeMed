import { Router } from 'express';
import * as catalogController from '../controller/catalog.controller';

const router = Router();

// Fully open — no auth. This is the "what can I buy here" overview.
router.get('/', catalogController.getAllProducts);

export default router;
