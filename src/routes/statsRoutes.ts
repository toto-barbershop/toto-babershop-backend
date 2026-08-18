import { Router } from 'express';
import { getStats, exportOrders } from '../controllers/statsController.js';

const router = Router();

router.get('/', getStats);
router.get('/export', exportOrders);

export default router;
