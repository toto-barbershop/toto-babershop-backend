import { Router } from 'express';
import { getStorys, getStory, createStory, updateStory, deleteStory } from '../controllers/storyController.js';
import { authenticateToken, requireAdmin } from '../middlewares/authMiddleware.js';

const router = Router();

router.get('/', getStorys);
router.get('/:id', getStory);
router.post('/', authenticateToken, requireAdmin, createStory);
router.put('/:id', authenticateToken, requireAdmin, updateStory);
router.delete('/:id', authenticateToken, requireAdmin, deleteStory);

export default router;
