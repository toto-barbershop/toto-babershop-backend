import type { Request, Response } from 'express';
import { prisma } from '../config/db.js';

export const getStorys = async (req: Request, res: Response) => {
  try {
    const data = await prisma.story.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: 'Lỗi server' });
  }
};

export const getStory = async (req: Request, res: Response) => {
  try {
    const data = await prisma.story.findUnique({ where: { id: req.params.id } });
    if (!data) return res.status(404).json({ error: 'Không tìm thấy' });
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: 'Lỗi server' });
  }
};

export const createStory = async (req: Request, res: Response) => {
  try {
    const data = await prisma.story.create({ data: req.body });
    res.status(201).json(data);
  } catch (error: any) {
    res.status(400).json({ error: 'Lỗi thêm mới' });
  }
};

export const updateStory = async (req: Request, res: Response) => {
  try {
    const data = await prisma.story.update({ where: { id: req.params.id }, data: req.body });
    res.json(data);
  } catch (error: any) {
    res.status(400).json({ error: 'Lỗi cập nhật' });
  }
};

export const deleteStory = async (req: Request, res: Response) => {
  try {
    await prisma.story.delete({ where: { id: req.params.id } });
    res.json({ message: 'Xóa thành công' });
  } catch (error: any) {
    res.status(400).json({ error: 'Lỗi xóa' });
  }
};
