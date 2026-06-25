import { Router } from 'express';
import * as paymentsController from '../controller/payments.controller';

const router = Router();

// Stripe webhooks require the raw request body for signature verification
router.post('/', paymentsController.handleWebhook);

export default router;
