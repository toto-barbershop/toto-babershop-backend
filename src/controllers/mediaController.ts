import type { Request, Response } from 'express';
import { prisma } from '../config/db.js';

export const getMedias = async (req: Request, res: Response) => {
  try {
    const data = await prisma.media.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: 'Lỗi server' });
  }
};

export const getMedia = async (req: Request, res: Response) => {
  try {
    const data = await prisma.media.findUnique({ where: { id: String(req.params.id) } });
    if (!data) return res.status(404).json({ error: 'Không tìm thấy' });
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: 'Lỗi server' });
  }
};

export const createMedia = async (req: Request, res: Response) => {
  try {
    const data = await prisma.media.create({ data: req.body });
    res.status(201).json(data);
  } catch (error: any) {
    res.status(400).json({ error: 'Lỗi thêm mới' });
  }
};

export const updateMedia = async (req: Request, res: Response) => {
  try {
    const data = await prisma.media.update({ where: { id: String(req.params.id) }, data: req.body });
    res.json(data);
  } catch (error: any) {
    res.status(400).json({ error: 'Lỗi cập nhật' });
  }
};

export const deleteMedia = async (req: Request, res: Response) => {
  try {
    await prisma.media.delete({ where: { id: String(req.params.id) } });
    res.json({ message: 'Xóa thành công' });
  } catch (error: any) {
    res.status(400).json({ error: 'Lỗi xóa' });
  }
};
