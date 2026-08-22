import rateLimit from 'express-rate-limit';

const isProd = process.env.NODE_ENV === 'production';

// Global limit: 5000 requests in dev, 500 requests / 15 minutes in prod
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProd ? 500 : 5000,
  skip: (req) => req.method === 'OPTIONS' || !isProd,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Quá nhiều yêu cầu, vui lòng thử lại sau.' }
});

// Checkout limit: 20 requests / 10 minutes in prod
export const checkoutLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: isProd ? 20 : 1000,
  skip: (req) => req.method === 'OPTIONS' || !isProd,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Bạn thao tác quá nhanh, vui lòng đợi vài phút rồi thử lại.' }
});

// Auth limit: 30 requests / 15 minutes in prod
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProd ? 30 : 1000,
  skip: (req) => req.method === 'OPTIONS' || !isProd,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Vượt quá số lần thử giới hạn. Vui lòng đợi 15 phút.' }
});
