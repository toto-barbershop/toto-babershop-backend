import { Router } from 'express';
import { getMedias, getMedia, createMedia, updateMedia, deleteMedia } from '../controllers/mediaController.js';
import { authenticateToken, requireAdmin } from '../middlewares/authMiddleware.js';

const router = Router();

router.get('/', getMedias);
router.get('/:id', getMedia);
router.post('/', authenticateToken, requireAdmin, createMedia);
router.put('/:id', authenticateToken, requireAdmin, updateMedia);
router.delete('/:id', authenticateToken, requireAdmin, deleteMedia);

export default router;
