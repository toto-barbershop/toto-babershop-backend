import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { logger } from '../utils/logger.js';

declare global {
  namespace Express {
    interface Request {
      id?: string;
      startTime?: number;
    }
  }
}

export const requestLoggerMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const reqId = (req.headers['x-request-id'] as string) || crypto.randomUUID();
  req.id = reqId;
  req.startTime = Date.now();

  res.setHeader('X-Request-Id', reqId);

  // Avoid logging health-check spam unless in debug
  const isHealthCheck = req.path === '/' || req.path === '/health' || req.path === '/api/health';

  if (!isHealthCheck) {
    logger.info(`--> [REQ-START] ${req.method} ${req.originalUrl || req.url}`, {
      reqId,
      ip: req.ip || req.socket.remoteAddress,
    });
  }

  res.on('finish', () => {
    const durationMs = Date.now() - (req.startTime || Date.now());
    const status = res.statusCode;
    const isError = status >= 400;

    if (!isHealthCheck) {
      const msg = `<-- [REQ-END] ${req.method} ${req.originalUrl || req.url} ${status}`;
      if (isError) {
        logger.warn(msg, { reqId, durationMs, status });
      } else {
        logger.info(msg, { reqId, durationMs, status });
      }
    }
  });

  next();
};
