import type { Request, Response } from "express";
import { prisma } from "../config/db.js";

export const getAllSettings = async (req: Request, res: Response) => {
  try {
    const settings = await prisma.setting.findMany();
    // Chuyển mảng [{key: "...", value: {...}}] thành object { "key": {...} }
    const result = settings.reduce((acc: any, s) => {
      acc[s.key] = s.value;
      return acc;
    }, {});
    res.json(result);
  } catch (error) {
    console.error("Get all settings error:", error);
    res.status(500).json({ error: "Lỗi máy chủ" });
  }
};

export const upsertSettings = async (req: Request, res: Response) => {
  try {
    const updates = req.body; // expected: { "key1": value1, "key2": value2 }
    for (const [key, value] of Object.entries(updates)) {
      await prisma.setting.upsert({
        where: { key },
        update: { value: value as any },
        create: { key, value: value as any },
      });
    }
    
    // Trả về bản cập nhật mới nhất
    const settings = await prisma.setting.findMany();
    const result = settings.reduce((acc: any, s) => {
      acc[s.key] = s.value;
      return acc;
    }, {});
    
    res.json(result);
  } catch (error) {
    console.error("Upsert settings error:", error);
    res.status(500).json({ error: "Lỗi cập nhật Cài đặt" });
  }
};
