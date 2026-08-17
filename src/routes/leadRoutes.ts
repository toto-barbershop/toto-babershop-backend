import { Router } from 'express';
import { getLeads, getLead, createLead, updateLead, deleteLead } from '../controllers/leadController.js';
import { authenticateToken, requireAdmin } from '../middlewares/authMiddleware.js';

const router = Router();

router.get('/', getLeads);
router.get('/:id', getLead);
router.post('/', authenticateToken, requireAdmin, createLead);
router.put('/:id', authenticateToken, requireAdmin, updateLead);
router.delete('/:id', authenticateToken, requireAdmin, deleteLead);

export default router;
