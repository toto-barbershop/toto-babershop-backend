import { Router } from 'express';
import {
  getTeamMembers,
  createTeamMember,
  updateTeamMember,
  deleteTeamMember,
} from '../controllers/teamMemberController.js';
import { authenticateToken, requireAdmin } from '../middlewares/authMiddleware.js';

const router = Router();

router.get('/', getTeamMembers);
router.post('/', authenticateToken, requireAdmin, createTeamMember);
router.put('/:id', authenticateToken, requireAdmin, updateTeamMember);
router.delete('/:id', authenticateToken, requireAdmin, deleteTeamMember);

export default router;
