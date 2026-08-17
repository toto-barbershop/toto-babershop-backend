import { Router } from 'express';
import { getOrders, createOrder, paymentWebhook, payosWebhook, updateOrderStatus, cancelOrder, getOrderStatus } from '../controllers/orderController.js';
import rateLimit from 'express-rate-limit';
import { authenticateToken, optionalAuth } from '../middlewares/authMiddleware.js';

const router = Router();

const checkoutLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 5,
  message: { error: 'Quá nhiều yêu cầu thanh toán, vui lòng thử lại sau.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.get('/', getOrders);
router.post('/checkout', optionalAuth, checkoutLimiter, createOrder);
router.post('/webhook/payment', paymentWebhook);     // webhook cũ (COD/legacy)
router.post('/webhook/payos', payosWebhook);          // webhook payOS
router.get('/:id/status', getOrderStatus);
router.put('/:id/status', updateOrderStatus);
router.put('/:id/cancel', authenticateToken, cancelOrder);

export default router;
