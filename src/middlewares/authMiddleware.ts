import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import redis from '../config/redis.js';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("Missing JWT_SECRET in environment variables");
}

export interface UserPayload {
  id: number;
  email: string;
  role: string;
  tokenVersion?: number;
}

export interface AuthRequest extends Request {
  user?: UserPayload | undefined;
}

export const authenticateToken = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token is required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as UserPayload;
    
    const currentVersion = await redis.get(`tokenVersion:${decoded.id}`);
    const expectedVersion = currentVersion ? parseInt(currentVersion) : 1;
    
    if (decoded.tokenVersion !== expectedVersion) {
      return res.status(401).json({ error: 'Phiên đăng nhập đã bị vô hiệu hóa hoặc hết hạn.' });
    }
    
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

export const requireAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.user?.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

export const optionalAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return next();
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as UserPayload;
    const currentVersion = await redis.get(`tokenVersion:${decoded.id}`);
    const expectedVersion = currentVersion ? parseInt(currentVersion) : 1;
    
    if (decoded.tokenVersion === expectedVersion) {
      req.user = decoded;
    }
  } catch (error) {
    // Ignore error since auth is optional
  }
  next();
};
