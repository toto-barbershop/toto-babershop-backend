import type { Request, Response } from "express";
import { prisma } from "../config/db.js";

export const getAllFaqs = async (req: Request, res: Response) => {
  try {
    const faqs = await prisma.faq.findMany({
      orderBy: { order: "asc" },
    });
    res.json(faqs);
  } catch (error) {
    console.error("Get all faqs error:", error);
    res.status(500).json({ error: "Lỗi máy chủ" });
  }
};

export const createFaq = async (req: Request, res: Response) => {
  try {
    const faq = await prisma.faq.create({
      data: req.body,
    });
    res.json(faq);
  } catch (error) {
    console.error("Create faq error:", error);
    res.status(500).json({ error: "Lỗi tạo FAQ" });
  }
};

export const updateFaq = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const faq = await prisma.faq.update({
      where: { id: Number(id) },
      data: req.body,
    });
    res.json(faq);
  } catch (error) {
    console.error("Update faq error:", error);
    res.status(500).json({ error: "Lỗi cập nhật FAQ" });
  }
};

export const deleteFaq = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await prisma.faq.delete({
      where: { id: Number(id) },
    });
    res.json({ success: true });
  } catch (error) {
    console.error("Delete faq error:", error);
    res.status(500).json({ error: "Lỗi xóa FAQ" });
  }
};
