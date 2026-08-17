import { Router } from 'express';
import { getLookbooks, getLookbook, createLookbook, updateLookbook, deleteLookbook } from '../controllers/lookbookController.js';
import { authenticateToken, requireAdmin } from '../middlewares/authMiddleware.js';

const router = Router();

router.get('/', getLookbooks);
router.get('/:id', getLookbook);
router.post('/', authenticateToken, requireAdmin, createLookbook);
router.put('/:id', authenticateToken, requireAdmin, updateLookbook);
router.delete('/:id', authenticateToken, requireAdmin, deleteLookbook);

export default router;
