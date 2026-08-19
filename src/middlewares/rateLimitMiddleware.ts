import rateLimit from 'express-rate-limit';

// Global limit: 200 requests / 15 minutes
export const globalLimiter = (rateLimit as any)({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Quá nhiều yêu cầu, vui lòng thử lại sau.' }
});

// Checkout limit: 5 requests / 10 minutes
export const checkoutLimiter = (rateLimit as any)({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Bạn thao tác quá nhanh, vui lòng đợi vài phút rồi thử lại.' }
});

// Auth limit: 10 requests / 15 minutes (for login/register/forgot-password)
export const authLimiter = (rateLimit as any)({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Vượt quá số lần thử giới hạn. Vui lòng đợi 15 phút.' }
});
