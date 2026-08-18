import { Router } from 'express';
import { getLeads, getLead, createLead, updateLead, deleteLead } from '../controllers/leadController.js';
import { authenticateToken, requireAdmin } from '../middlewares/authMiddleware.js';

const router = Router();

router.get('/', authenticateToken, requireAdmin, getLeads);
router.get('/:id', authenticateToken, requireAdmin, getLead);
router.post('/', createLead);
router.put('/:id', authenticateToken, requireAdmin, updateLead);
router.delete('/:id', authenticateToken, requireAdmin, deleteLead);

export default router;
