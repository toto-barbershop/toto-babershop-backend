import type { Request, Response } from "express";
import { prisma } from "../config/db.js";
import redis from "../config/redis.js";

export const getAllPromoCodes = async (req: Request, res: Response) => {
  try {
    const promos = await prisma.promoCode.findMany({
      orderBy: { createdAt: "desc" }
    });
    res.json(promos);
  } catch (error) {
    console.error("Get all promos error:", error);
    res.status(500).json({ error: "Lỗi máy chủ" });
  }
};

export const createPromoCode = async (req: Request, res: Response) => {
  try {
    let data = { ...req.body };
    if (data.expiresAt) {
      data.expiresAt = new Date(data.expiresAt);
    }
    const promo = await prisma.promoCode.create({
      data
    });
    res.json(promo);
  } catch (error) {
    console.error("Create promo error:", error);
    res.status(500).json({ error: "Lỗi tạo mã giảm giá" });
  }
};

export const updatePromoCode = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    let data = { ...req.body };
    if (data.expiresAt) {
      data.expiresAt = new Date(data.expiresAt);
    }
    const promo = await prisma.promoCode.update({
      where: { id: parseInt(String(id)) },
      data
    });
    // Invalidate cache
    await redis.del(`promo:${promo.code.toUpperCase()}`);
    res.json(promo);
  } catch (error) {
    console.error("Update promo error:", error);
    res.status(500).json({ error: "Lỗi cập nhật mã giảm giá" });
  }
};

export const deletePromoCode = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const promo = await prisma.promoCode.delete({
      where: { id: parseInt(String(id)) }
    });
    // Invalidate cache
    await redis.del(`promo:${promo.code.toUpperCase()}`);
    res.json({ success: true });
  } catch (error) {
    console.error("Delete promo error:", error);
    res.status(500).json({ error: "Lỗi xóa mã giảm giá" });
  }
};

export const validatePromoCode = async (req: Request, res: Response) => {
  try {
    const { code, subtotal } = req.body;
    
    if (!code || subtotal === undefined) {
      return res.status(400).json({ error: "Thiếu code hoặc subtotal" });
    }

    const cacheKey = `promo:${code.toUpperCase()}`;
    let promo = null;

    const cachedPromo = await redis.get(cacheKey);
    if (cachedPromo) {
      promo = JSON.parse(cachedPromo);
    } else {
      promo = await prisma.promoCode.findUnique({
        where: { code: code.toUpperCase() }
      });
      if (promo) {
        await redis.set(cacheKey, JSON.stringify(promo), 'EX', 3600); // 1 giờ TTL
      }
    }

    if (!promo || !promo.isActive) {
      return res.status(400).json({ error: "Mã khuyến mãi không hợp lệ hoặc đã bị khóa." });
    }

    if (promo.expiresAt && new Date() > new Date(promo.expiresAt)) {
      return res.status(400).json({ error: "Mã khuyến mãi đã hết hạn sử dụng." });
    }

    if (promo.usageLimit !== null && promo.usedCount >= promo.usageLimit) {
      return res.status(400).json({ error: "Mã khuyến mãi đã hết lượt sử dụng." });
    }

    if (subtotal < promo.minOrderValue) {
      return res.status(400).json({ error: `Đơn hàng chưa đạt giá trị tối thiểu ${promo.minOrderValue.toLocaleString("vi-VN")}đ để sử dụng mã này.` });
    }

    let discount = 0;
    if (promo.discountType === "PERCENT") {
      discount = Math.floor(subtotal * (promo.discountValue / 100));
      if (promo.maxDiscount && discount > promo.maxDiscount) {
        discount = promo.maxDiscount;
      }
    } else if (promo.discountType === "FIXED") {
      discount = promo.discountValue;
    }

    if (discount > subtotal) {
      discount = subtotal;
    }

    res.json({ success: true, discount, code: promo.code });
  } catch (error) {
    console.error("Validate promo error:", error);
    res.status(500).json({ error: "Lỗi máy chủ" });
  }
};
