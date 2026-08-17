import type { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { prisma } from '../config/db.js';
import { sendPasswordResetEmail } from '../services/emailService.js';
import redis from '../config/redis.js';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("Missing JWT_SECRET in environment variables");
}

export const register = async (req: Request, res: Response) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'Email is already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        role: 'CUSTOMER'
      }
    });

    const currentVersionStr = await redis.get(`tokenVersion:${user.id}`);
    const tokenVersion = currentVersionStr ? parseInt(currentVersionStr) : 1;
    if (!currentVersionStr) {
      await redis.set(`tokenVersion:${user.id}`, tokenVersion);
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, tokenVersion },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(201).json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to register user' });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const currentVersionStr = await redis.get(`tokenVersion:${user.id}`);
    const tokenVersion = currentVersionStr ? parseInt(currentVersionStr) : 1;
    if (!currentVersionStr) {
      await redis.set(`tokenVersion:${user.id}`, tokenVersion);
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, tokenVersion },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to log in' });
  }
};

export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    
    // Luôn trả về success message dù email có tồn tại hay không (để tránh rò rỉ thông tin)
    if (!user) {
      return res.json({ message: 'Nếu email tồn tại, chúng tôi đã gửi mã xác nhận' });
    }

    // Sinh OTP 6 số
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Băm OTP bằng SHA-256
    const tokenHash = crypto.createHash('sha256').update(otpCode).digest('hex');
    
    // Hết hạn sau 15 phút
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      }
    });

    // Gửi email
    await sendPasswordResetEmail(user.email, otpCode);

    res.json({ message: 'Nếu email tồn tại, chúng tôi đã gửi mã xác nhận' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Failed to process request' });
  }
};

export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { email, code, newPassword } = req.body;

    if (!email || !code || !newPassword) {
      return res.status(400).json({ error: 'Email, code, and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(400).json({ error: 'Mã không đúng hoặc đã hết hạn.' }); // Không nói rõ lỗi do email
    }

    const tokenHash = crypto.createHash('sha256').update(code).digest('hex');

    // Tìm token mới nhất, trùng hash, chưa hết hạn, chưa sử dụng
    const token = await prisma.passwordResetToken.findFirst({
      where: {
        userId: user.id,
        tokenHash,
        used: false,
        expiresAt: { gt: new Date() } // expiresAt > now
      },
      orderBy: { createdAt: 'desc' }
    });

    if (!token) {
      return res.status(400).json({ error: 'Mã xác nhận không đúng hoặc đã hết hạn.' });
    }

    // Đổi mật khẩu
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { password: hashedPassword }
      }),
      prisma.passwordResetToken.update({
        where: { id: token.id },
        data: { used: true }
      })
    ]);

    // Thu hồi toàn bộ session cũ bằng cách tăng tokenVersion
    await redis.incr(`tokenVersion:${user.id}`);

    res.json({ message: 'Đổi mật khẩu thành công.' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
};

export const logout = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (user && user.id) {
      await redis.incr(`tokenVersion:${user.id}`);
    }
    res.json({ message: 'Đăng xuất thành công' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to logout' });
  }
};

export const getUsers = async (req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' }
    });

    const mappedUsers = users.map((u: any) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      phone: u.phone,
      role: u.role,
      status: 'active', // Mock status since we don't have it
      createdAt: u.createdAt.toISOString()
    }));

    res.json(mappedUsers);
  } catch (error) {
    console.error('getUsers error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
};

export const createUser = async (req: Request, res: Response) => {
  try {
    const { email, password, name, phone, role } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'Email is already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        phone,
        role: role || 'CUSTOMER'
      }
    });

    res.status(201).json({
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      role: user.role,
      status: 'active',
      createdAt: user.createdAt.toISOString()
    });
  } catch (error) {
    console.error('createUser error:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
};
