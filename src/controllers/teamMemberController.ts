import type { Request, Response } from 'express';
import { prisma } from '../config/db.js';
import redis from '../config/redis.js';

const CACHE_KEY = 'cache:team-members';

function normalizePayload(body: any, partial = false) {
  const payload: Record<string, unknown> = {};

  if (!partial || body.name !== undefined) payload.name = String(body.name || '').trim();
  if (!partial || body.role !== undefined) payload.role = String(body.role || '').trim();
  if (!partial || body.image !== undefined) payload.image = String(body.image || '').trim();
  if (!partial || body.description !== undefined) payload.description = body.description ? String(body.description).trim() : null;
  if (!partial || body.specialty !== undefined) payload.specialty = body.specialty ? String(body.specialty).trim() : null;
  if (!partial || body.status !== undefined) payload.status = body.status === 'hidden' ? 'hidden' : 'active';
  if (!partial || body.order !== undefined) payload.order = Math.max(0, Number.parseInt(String(body.order ?? 0), 10) || 0);

  return payload;
}

export const getTeamMembers = async (_req: Request, res: Response) => {
  try {
    const cached = await redis.get(CACHE_KEY);
    if (cached) return res.json(JSON.parse(cached));

    const data = await prisma.teamMember.findMany({
      orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
    });
    await redis.set(CACHE_KEY, JSON.stringify(data), 'EX', 3600);
    res.json(data);
  } catch (_error) {
    res.status(500).json({ error: 'Lỗi tải danh sách đội ngũ' });
  }
};

export const createTeamMember = async (req: Request, res: Response) => {
  try {
    const payload = normalizePayload(req.body);
    if (!payload.name || !payload.role || !payload.image) {
      return res.status(400).json({ error: 'Tên, vai trò và hình ảnh là bắt buộc' });
    }

    const data = await prisma.teamMember.create({ data: payload as any });
    await redis.del(CACHE_KEY);
    res.status(201).json(data);
  } catch (error) {
    console.error('Error creating team member:', error);
    res.status(400).json({ error: 'Lỗi thêm thành viên đội ngũ' });
  }
};

export const updateTeamMember = async (req: Request, res: Response) => {
  try {
    const data = await prisma.teamMember.update({
      where: { id: String(req.params.id) },
      data: normalizePayload(req.body, true) as any,
    });
    await redis.del(CACHE_KEY);
    res.json(data);
  } catch (error) {
    console.error('Error updating team member:', error);
    res.status(400).json({ error: 'Lỗi cập nhật thành viên đội ngũ' });
  }
};

export const deleteTeamMember = async (req: Request, res: Response) => {
  try {
    const data = await prisma.teamMember.delete({ where: { id: String(req.params.id) } });
    await redis.del(CACHE_KEY);
    res.json({ success: true, teamMember: data });
  } catch (error) {
    console.error('Error deleting team member:', error);
    res.status(400).json({ error: 'Lỗi xóa thành viên đội ngũ' });
  }
};
