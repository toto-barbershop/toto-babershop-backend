import { Router } from 'express';
import { getStats, exportOrders } from '../controllers/statsController.js';
import { authenticateToken, requireAdmin } from '../middlewares/authMiddleware.js';

const router = Router();

router.get('/', authenticateToken, requireAdmin, getStats);
router.get('/export', authenticateToken, requireAdmin, exportOrders);

export default router;
