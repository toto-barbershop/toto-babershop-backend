import { Router } from 'express';
import { getServices, createService, updateService, deleteService } from '../controllers/serviceController.js';
import { authenticateToken, requireAdmin } from '../middlewares/authMiddleware.js';

const router = Router();

router.get('/', getServices);
router.post('/', authenticateToken, requireAdmin, createService);
router.put('/:id', authenticateToken, requireAdmin, updateService);
router.delete('/:id', authenticateToken, requireAdmin, deleteService);

export default router;
