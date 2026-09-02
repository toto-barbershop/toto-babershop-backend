import type { Request, Response } from 'express';
import { addClient, removeClient, getConnectedCount } from '../services/sseManager.js';
import { logger } from '../utils/logger.js';

/**
 * GET /api/orders/stream
 * Khách hàng kết nối vào đây để nhận realtime SSE updates về đơn hàng của họ.
 * Yêu cầu token hợp lệ (authMiddleware đã xử lý trước đó).
 */
export const streamOrders = (req: Request, res: Response): void => {
  const userId = (req as any).user?.id;

  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  // Thiết lập SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Tắt nginx/Caddy buffering
  res.flushHeaders();

  // Gửi ping đầu tiên để xác nhận kết nối
  res.write(`event: connected\ndata: {"userId":${userId}}\n\n`);
  logger.info(`SSE: User #${userId} connected. Total: ${getConnectedCount() + 1}`);

  // Đăng ký client
  addClient(userId, res);

  // Gửi ping heartbeat mỗi 20 giây để giữ kết nối
  const heartbeat = setInterval(() => {
    try {
      res.write(`: heartbeat\n\n`);
    } catch {
      clearInterval(heartbeat);
    }
  }, 20_000);

  // Cleanup khi client đóng tab hoặc mất mạng
  req.on('close', () => {
    clearInterval(heartbeat);
    removeClient(userId, res);
    logger.info(`SSE: User #${userId} disconnected. Total: ${getConnectedCount()}`);
  });
};
