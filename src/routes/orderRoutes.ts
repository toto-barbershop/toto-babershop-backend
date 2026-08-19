import { Router } from 'express';
import { getOrders, createOrder, paymentWebhook, payosWebhook, updateOrderStatus, cancelOrder, getOrderStatus } from '../controllers/orderController.js';
import { checkoutLimiter } from '../middlewares/rateLimitMiddleware.js';
import { authenticateToken, optionalAuth, requireAdmin } from '../middlewares/authMiddleware.js';

const router = Router();

router.get('/', authenticateToken, requireAdmin, getOrders);
router.post('/checkout', optionalAuth, checkoutLimiter, createOrder);
router.post('/webhook/payment', paymentWebhook);     // webhook cũ (COD/legacy)
router.post('/webhook/payos', payosWebhook);          // webhook payOS
router.get('/:id/status', getOrderStatus);
router.put('/:id/status', authenticateToken, requireAdmin, updateOrderStatus);
router.put('/:id/cancel', authenticateToken, cancelOrder);

export default router;
