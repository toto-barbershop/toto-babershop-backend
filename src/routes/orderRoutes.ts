import { Router } from 'express';
import { 
  getOrders, 
  createOrder, 
  paymentWebhook, 
  payosWebhook, 
  updateOrderStatus, 
  cancelOrder, 
  getOrderStatus, 
  retryPayment, 
  getOrderHistory,
  markCodCollected,
  getBlockedPhones,
  addBlockedPhone,
  removeBlockedPhone,
  getOrderByCode,
  retryPaymentByCode,
  cancelOrderByCode
} from '../controllers/orderController.js';
import { streamOrders } from '../controllers/sseController.js';
import { checkoutLimiter } from '../middlewares/rateLimitMiddleware.js';
import { authenticateToken, optionalAuth, requireAdmin } from '../middlewares/authMiddleware.js';

const router = Router();

router.get('/stream', authenticateToken, streamOrders);    // SSE Realtime stream
router.get('/', optionalAuth, getOrders);
router.post('/checkout', optionalAuth, checkoutLimiter, createOrder);
router.post('/webhook/payment', paymentWebhook);     // webhook cũ (COD/legacy)
router.post('/webhook/payos', payosWebhook);          // webhook payOS

// Quản lý Blacklist SĐT chống bom hàng (đặt trước :id để tránh conflict)
router.get('/blacklist', authenticateToken, requireAdmin, getBlockedPhones);
router.post('/blacklist', authenticateToken, requireAdmin, addBlockedPhone);
router.delete('/blacklist/:phone', authenticateToken, requireAdmin, removeBlockedPhone);

// Các endpoint công khai tra cứu & xử lý đơn hàng qua mã orderCode (Cho cả Guest & User)
router.get('/by-code/:orderCode', getOrderByCode);
router.post('/by-code/:orderCode/retry-payment', retryPaymentByCode);
router.post('/by-code/:orderCode/cancel', cancelOrderByCode);

router.get('/:id/status', getOrderStatus);
router.get('/:id/history', authenticateToken, requireAdmin, getOrderHistory);
router.post('/:id/retry-payment', optionalAuth, retryPayment);
router.put('/:id/status', authenticateToken, requireAdmin, updateOrderStatus);
router.post('/:id/mark-cod-collected', authenticateToken, requireAdmin, markCodCollected);
router.put('/:id/cancel', authenticateToken, cancelOrder);

export default router;
