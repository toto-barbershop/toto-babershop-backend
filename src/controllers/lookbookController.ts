import type { Request, Response } from 'express';
import { prisma } from '../config/db.js';
import redis from '../config/redis.js';

export const getLookbooks = async (req: Request, res: Response) => {
  try {
    const cached = await redis.get('cache:lookbooks');
    if (cached) return res.json(JSON.parse(cached));

    const data = await prisma.lookbook.findMany({ orderBy: { createdAt: 'desc' } });
    await redis.set('cache:lookbooks', JSON.stringify(data), 'EX', 3600);
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: 'Lỗi server' });
  }
};

export const getLookbook = async (req: Request, res: Response) => {
  try {
    const data = await prisma.lookbook.findUnique({ where: { id: String(req.params.id) } });
    if (!data) return res.status(404).json({ error: 'Không tìm thấy' });
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: 'Lỗi server' });
  }
};

export const createLookbook = async (req: Request, res: Response) => {
  try {
    const data = await prisma.lookbook.create({ data: req.body });
    await redis.del('cache:lookbooks');
    res.status(201).json(data);
  } catch (error: any) {
    res.status(400).json({ error: 'Lỗi thêm mới' });
  }
};

export const updateLookbook = async (req: Request, res: Response) => {
  try {
    const data = await prisma.lookbook.update({ where: { id: String(req.params.id) }, data: req.body });
    await redis.del('cache:lookbooks');
    res.json(data);
  } catch (error: any) {
    res.status(400).json({ error: 'Lỗi cập nhật' });
  }
};

export const deleteLookbook = async (req: Request, res: Response) => {
  try {
    await prisma.lookbook.delete({ where: { id: String(req.params.id) } });
    await redis.del('cache:lookbooks');
    res.json({ message: 'Xóa thành công' });
  } catch (error: any) {
    res.status(400).json({ error: 'Lỗi xóa' });
  }
};
