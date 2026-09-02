import type { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { prisma } from '../config/db.js';
import { sendPasswordResetEmail } from '../services/emailService.js';
import redis from '../config/redis.js';
import { isValidEmail } from '../utils/validation.js';
import { logger } from '../utils/logger.js';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("Missing JWT_SECRET in environment variables");
}

export const register = async (req: Request, res: Response) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Vui lòng nhập đầy đủ họ tên, email và mật khẩu.', reqId: req.id });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Địa chỉ email không đúng định dạng. Vui lòng kiểm tra lại.', reqId: req.id });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      logger.warn(`Register failed: email already exists: ${email}`, { reqId: req.id });
      return res.status(400).json({ error: 'Email này đã được đăng ký tài khoản tại ToTo Barbershop. Vui lòng đăng nhập.', reqId: req.id });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        role: 'CUSTOMER'
      },
      include: { addresses: true }
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

    logger.info(`Customer registered successfully: ${email}`, { reqId: req.id, userId: user.id });

    res.status(201).json({
      message: 'Đăng ký tài khoản thành công. Chào mừng bạn đến với ToTo Barbershop!',
      token,
      user: { id: user.id, email: user.email, name: user.name, phone: user.phone || "", role: user.role, addresses: user.addresses },
      reqId: req.id
    });
  } catch (error) {
    logger.error('Register error', error, { reqId: req.id });
    res.status(500).json({ error: 'Đăng ký tài khoản không thành công. Vui lòng thử lại sau ít phút.', reqId: req.id });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Vui lòng nhập đầy đủ email và mật khẩu.', reqId: req.id });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Địa chỉ email không đúng định dạng.', reqId: req.id });
    }

    const user = await prisma.user.findUnique({ 
      where: { email },
      include: { addresses: true }
    });
    if (!user) {
      logger.warn(`Login failed: user not found: ${email}`, { reqId: req.id });
      return res.status(401).json({ error: 'Email hoặc mật khẩu không chính xác. Vui lòng kiểm tra lại.', reqId: req.id });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      logger.warn(`Login failed: invalid password for: ${email}`, { reqId: req.id });
      return res.status(401).json({ error: 'Email hoặc mật khẩu không chính xác. Vui lòng kiểm tra lại.', reqId: req.id });
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

    logger.info(`User logged in successfully: ${email} (${user.role})`, { reqId: req.id, userId: user.id });

    res.json({
      message: 'Đăng nhập thành công! Chào mừng quý khách.',
      token,
      user: { id: user.id, email: user.email, name: user.name, phone: user.phone || "", role: user.role, addresses: user.addresses },
      reqId: req.id
    });
  } catch (error) {
    logger.error('Login error', error, { reqId: req.id });
    res.status(500).json({ error: 'Đăng nhập không thành công. Vui lòng thử lại sau ít phút.', reqId: req.id });
  }
};

export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Vui lòng nhập địa chỉ email.', reqId: req.id });
    if (!isValidEmail(email)) return res.status(400).json({ error: 'Địa chỉ email không đúng định dạng.', reqId: req.id });

    const user = await prisma.user.findUnique({ where: { email } });
    
    // Luôn trả về thông báo chuẩn để bảo mật thông tin tài khoản
    if (!user) {
      logger.info(`Forgot password requested for non-existent email: ${email}`, { reqId: req.id });
      return res.json({ message: 'Nếu email tồn tại trong hệ thống ToTo Barbershop, mã xác nhận OTP đã được gửi đến hộp thư của bạn.' });
    }

    // Sinh OTP 6 số ngẫu nhiên
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

    // Gửi email xác nhận
    await sendPasswordResetEmail(user.email, otpCode);
    logger.info(`Password reset OTP generated & sent for: ${email}`, { reqId: req.id });

    res.json({ message: 'Mã xác nhận OTP (6 số) đã được gửi đến email của bạn. Vui lòng kiểm tra hộp thư.' });
  } catch (error) {
    logger.error('Forgot password error', error, { reqId: req.id });
    res.status(500).json({ error: 'Không thể gửi mã xác nhận lúc này. Vui lòng thử lại sau.', reqId: req.id });
  }
};

export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { email, code, newPassword } = req.body;

    if (!email || !code || !newPassword) {
      return res.status(400).json({ error: 'Vui lòng nhập đầy đủ email, mã OTP và mật khẩu mới.', reqId: req.id });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Mật khẩu mới phải có độ dài tối thiểu 6 ký tự.', reqId: req.id });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(400).json({ error: 'Mã xác nhận không hợp lệ hoặc đã hết hạn sử dụng.', reqId: req.id });
    }

    const tokenHash = crypto.createHash('sha256').update(code).digest('hex');

    const token = await prisma.passwordResetToken.findFirst({
      where: {
        userId: user.id,
        tokenHash,
        used: false,
        expiresAt: { gt: new Date() }
      },
      orderBy: { createdAt: 'desc' }
    });

    if (!token) {
      logger.warn(`Reset password failed: invalid/expired OTP token for: ${email}`, { reqId: req.id });
      return res.status(400).json({ error: 'Mã xác nhận OTP không đúng hoặc đã hết hạn. Vui lòng yêu cầu mã mới.', reqId: req.id });
    }

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

    // Thu hồi toàn bộ session cũ
    await redis.incr(`tokenVersion:${user.id}`);
    logger.info(`Password reset successfully for: ${email}`, { reqId: req.id });

    res.json({ message: 'Đặt lại mật khẩu thành công! Quý khách có thể đăng nhập ngay bằng mật khẩu mới.' });
  } catch (error) {
    logger.error('Reset password error', error, { reqId: req.id });
    res.status(500).json({ error: 'Đổi mật khẩu không thành công. Vui lòng thử lại sau.', reqId: req.id });
  }
};

export const changePassword = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ error: 'Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.', reqId: req.id });

    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Vui lòng nhập mật khẩu hiện tại và mật khẩu mới.', reqId: req.id });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Mật khẩu mới phải có tối thiểu 6 ký tự.', reqId: req.id });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: 'Không tìm thấy thông tin tài khoản.', reqId: req.id });

    const isValidPassword = await bcrypt.compare(currentPassword, user.password);
    if (!isValidPassword) {
      return res.status(400).json({ error: 'Mật khẩu hiện tại không chính xác.', reqId: req.id });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword }
    });

    await redis.incr(`tokenVersion:${userId}`);
    logger.info(`Password changed for user id #${userId}`, { reqId: req.id });

    res.json({ message: 'Cập nhật mật khẩu thành công!' });
  } catch (error) {
    logger.error('Change password error', error, { reqId: req.id });
    res.status(500).json({ error: 'Có lỗi xảy ra khi đổi mật khẩu. Vui lòng thử lại.', reqId: req.id });
  }
};

export const logout = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (user && user.id) {
      await redis.incr(`tokenVersion:${user.id}`);
      logger.info(`User logged out: ${user.email}`, { reqId: req.id });
    }
    res.json({ message: 'Đăng xuất thành công. Hẹn gặp lại quý khách!' });
  } catch (error) {
    logger.error('Logout error', error, { reqId: req.id });
    res.status(500).json({ error: 'Đăng xuất không thành công.', reqId: req.id });
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
      status: 'active',
      createdAt: u.createdAt.toISOString()
    }));

    res.json(mappedUsers);
  } catch (error) {
    logger.error('getUsers error', error, { reqId: req.id });
    res.status(500).json({ error: 'Không thể lấy danh sách người dùng.', reqId: req.id });
  }
};

export const createUser = async (req: Request, res: Response) => {
  try {
    const { email, password, name, phone, role } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Vui lòng nhập đầy đủ thông tin: họ tên, email và mật khẩu.', reqId: req.id });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'Địa chỉ email này đã tồn tại trong hệ thống.', reqId: req.id });
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

    logger.info(`User created by admin: ${email} (${user.role})`, { reqId: req.id });

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
    logger.error('createUser error', error, { reqId: req.id });
    res.status(500).json({ error: 'Tạo tài khoản không thành công.', reqId: req.id });
  }
};

export const updateUser = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const { name, phone, role, password } = req.body;

    if (!id || isNaN(id)) {
      return res.status(400).json({ error: 'ID người dùng không hợp lệ.', reqId: req.id });
    }

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return res.status(404).json({ error: 'Không tìm thấy người dùng.', reqId: req.id });
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (phone !== undefined) updateData.phone = phone;
    if (role !== undefined) updateData.role = role;

    if (password && typeof password === 'string' && password.trim().length >= 6) {
      updateData.password = await bcrypt.hash(password.trim(), 10);
      await redis.incr(`tokenVersion:${id}`);
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        createdAt: true,
      }
    });

    logger.info(`User updated by admin: id #${id} (${updatedUser.email})`, { reqId: req.id });

    res.json({
      ...updatedUser,
      status: 'active',
      createdAt: updatedUser.createdAt.toISOString()
    });
  } catch (error) {
    logger.error('updateUser error', error, { reqId: req.id });
    res.status(500).json({ error: 'Cập nhật tài khoản không thành công.', reqId: req.id });
  }
};

export const deleteUser = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const currentAdminId = (req as any).user?.id;

    if (!id || isNaN(id)) {
      return res.status(400).json({ error: 'ID người dùng không hợp lệ.', reqId: req.id });
    }

    if (id === currentAdminId) {
      return res.status(400).json({ error: 'Không thể tự xóa tài khoản quản trị đang đăng nhập.', reqId: req.id });
    }

    const user = await prisma.user.findUnique({
      where: { id },
      include: { _count: { select: { orders: true } } }
    });

    if (!user) {
      return res.status(404).json({ error: 'Không tìm thấy người dùng.', reqId: req.id });
    }

    // Xóa các dữ liệu phụ trợ trước
    await prisma.passwordResetToken.deleteMany({ where: { userId: id } });
    await prisma.address.deleteMany({ where: { userId: id } });

    // Xóa đơn hàng nếu có
    if (user._count.orders > 0) {
      const orders = await prisma.order.findMany({ where: { userId: id }, select: { id: true } });
      const orderIds = orders.map(o => o.id);
      await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.order.deleteMany({ where: { userId: id } });
    }

    await prisma.user.delete({ where: { id } });
    await redis.del(`tokenVersion:${id}`);

    logger.info(`User deleted by admin: id #${id} (${user.email})`, { reqId: req.id });
    res.json({ message: 'Xóa tài khoản thành công.' });
  } catch (error) {
    logger.error('deleteUser error', error, { reqId: req.id });
    res.status(500).json({ error: 'Xóa tài khoản không thành công.', reqId: req.id });
  }
};

