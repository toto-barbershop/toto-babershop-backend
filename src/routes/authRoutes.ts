import { Router } from 'express';
import { register, login, forgotPassword, resetPassword, getUsers, createUser, logout, changePassword } from '../controllers/authController.js';
import { authenticateToken, requireAdmin } from '../middlewares/authMiddleware.js';
import { authLimiter } from '../middlewares/rateLimitMiddleware.js';

const router = Router();

router.post('/login', authLimiter, login);
router.post('/logout', authenticateToken, logout);
router.post('/register', authLimiter, register);
router.post('/forgot-password', authLimiter, forgotPassword);
router.post('/reset-password', authLimiter, resetPassword);
router.post('/change-password', authenticateToken, changePassword);

router.get('/users', authenticateToken, requireAdmin, getUsers);
router.post('/users', authenticateToken, requireAdmin, createUser);

export default router;
