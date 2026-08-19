import type { Request, Response } from 'express';
import { prisma } from '../config/db.js';

export const getCourses = async (req: Request, res: Response) => {
  try {
    const data = await prisma.course.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: 'Lỗi server' });
  }
};

export const getCourse = async (req: Request, res: Response) => {
  try {
    const data = await prisma.course.findUnique({ where: { id: (req.params.id as string) } });
    if (!data) return res.status(404).json({ error: 'Không tìm thấy' });
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: 'Lỗi server' });
  }
};

export const createCourse = async (req: Request, res: Response) => {
  try {
    const data = await prisma.course.create({ data: req.body });
    res.status(201).json(data);
  } catch (error: any) {
    res.status(400).json({ error: 'Lỗi thêm mới' });
  }
};

export const updateCourse = async (req: Request, res: Response) => {
  try {
    const data = await prisma.course.update({ where: { id: (req.params.id as string) }, data: req.body });
    res.json(data);
  } catch (error: any) {
    res.status(400).json({ error: 'Lỗi cập nhật' });
  }
};

export const deleteCourse = async (req: Request, res: Response) => {
  try {
    await prisma.course.delete({ where: { id: (req.params.id as string) } });
    res.json({ message: 'Xóa thành công' });
  } catch (error: any) {
    res.status(400).json({ error: 'Lỗi xóa' });
  }
};
