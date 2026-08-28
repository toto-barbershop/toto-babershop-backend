import rateLimit from 'express-rate-limit';

const isProd = process.env.NODE_ENV === 'production';

/**
 * Kiểm tra xem request có chứa token bí mật để bypass rate limit phục vụ kiểm thử tải (Load Test) không
 */
const isLoadTestAuthorized = (req: any): boolean => {
  const secret = process.env.LOAD_TEST_SECRET;
  if (!secret) return false;
  const token = req.headers['x-load-test-token'];
  return Boolean(token && token === secret);
};

// Global limit: 5000 requests in dev, 1000 requests / 15 minutes in prod (Tối ưu cho mạng CGNAT 4G/5G tại VN)
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProd ? 1000 : 5000,
  skip: (req) => req.method === 'OPTIONS' || !isProd || isLoadTestAuthorized(req),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Quá nhiều yêu cầu, vui lòng thử lại sau.' }
});

// Checkout limit: 20 requests / 10 minutes in prod
export const checkoutLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: isProd ? 20 : 1000,
  skip: (req) => req.method === 'OPTIONS' || !isProd || isLoadTestAuthorized(req),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Bạn thao tác quá nhanh, vui lòng đợi vài phút rồi thử lại.' }
});

// Auth limit: 30 requests / 15 minutes in prod
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProd ? 30 : 1000,
  skip: (req) => req.method === 'OPTIONS' || !isProd || isLoadTestAuthorized(req),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Vượt quá số lần thử giới hạn. Vui lòng đợi 15 phút.' }
});
