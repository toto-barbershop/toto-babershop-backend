import type { Request, Response } from "express";
import { prisma } from "../config/db.js";

// POST /api/messages - Customer submits a new contact message
export const submitMessage = async (req: Request, res: Response) => {
  try {
    const { name, email, phone, subject, message } = req.body;
    
    if (!name || !email || !message) {
      return res.status(400).json({ error: "Vui lòng điền đầy đủ họ tên, email và lời nhắn." });
    }

    const newMessage = await prisma.contactMessage.create({
      data: {
        name,
        email,
        phone: phone || null,
        subject: subject || null,
        message,
        status: "unread",
      },
    });

    res.status(201).json(newMessage);
  } catch (error) {
    console.error("Submit message error:", error);
    res.status(500).json({ error: "Lỗi hệ thống khi gửi lời nhắn." });
  }
};

// GET /api/messages - Admin gets all messages
export const getAllMessages = async (req: Request, res: Response) => {
  try {
    const messages = await prisma.contactMessage.findMany({
      orderBy: { createdAt: "desc" },
    });
    res.json(messages);
  } catch (error) {
    console.error("Get all messages error:", error);
    res.status(500).json({ error: "Lỗi khi lấy danh sách tin nhắn." });
  }
};

// PUT /api/messages/:id/status - Admin updates message status
export const updateMessageStatus = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { status } = req.body;
    
    if (!["unread", "read", "replied"].includes(status)) {
      return res.status(400).json({ error: "Trạng thái không hợp lệ." });
    }

    const updated = await prisma.contactMessage.update({
      where: { id },
      data: { status },
    });
    res.json(updated);
  } catch (error) {
    console.error("Update message status error:", error);
    res.status(500).json({ error: "Lỗi khi cập nhật trạng thái tin nhắn." });
  }
};

// DELETE /api/messages/:id - Admin deletes a message
export const deleteMessage = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    await prisma.contactMessage.delete({ where: { id } });
    res.json({ message: "Đã xóa tin nhắn." });
  } catch (error) {
    console.error("Delete message error:", error);
    res.status(500).json({ error: "Lỗi khi xóa tin nhắn." });
  }
};
