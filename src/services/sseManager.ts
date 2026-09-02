import type { Response } from 'express';

// Lưu trữ SSE clients: userId -> Set<Response>
const clients = new Map<number, Set<Response>>();

/**
 * Đăng ký một SSE client mới cho userId
 */
export function addClient(userId: number, res: Response): void {
  if (!clients.has(userId)) {
    clients.set(userId, new Set());
  }
  clients.get(userId)!.add(res);
}

/**
 * Xoá SSE client khi kết nối đóng
 */
export function removeClient(userId: number, res: Response): void {
  clients.get(userId)?.delete(res);
  if (clients.get(userId)?.size === 0) {
    clients.delete(userId);
  }
}

/**
 * Gửi sự kiện SSE đến tất cả client đang kết nối với userId
 */
export function pushToUser(userId: number, event: string, data: object): void {
  const userClients = clients.get(userId);
  if (!userClients || userClients.size === 0) return;

  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of userClients) {
    try {
      res.write(payload);
    } catch {
      userClients.delete(res);
    }
  }
}

/**
 * Gửi sự kiện SSE đến TẤT CẢ clients đang kết nối (broadcast)
 */
export function broadcast(event: string, data: object): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const userClients of clients.values()) {
    for (const res of userClients) {
      try {
        res.write(payload);
      } catch {
        userClients.delete(res);
      }
    }
  }
}

export function getConnectedCount(): number {
  let count = 0;
  for (const s of clients.values()) count += s.size;
  return count;
}
