import type { Request, Response } from "express";
import { prisma } from "../config/db.js";
import redis from "../config/redis.js";
import { logger } from "../utils/logger.js";

export const getAllPromoCodes = async (req: Request, res: Response) => {
  try {
    const promos = await prisma.promoCode.findMany({
      orderBy: { createdAt: "desc" }
    });
    res.json(promos);
  } catch (error) {
    logger.error("Get all promos error", error, { reqId: req.id });
    res.status(500).json({ error: "Lỗi máy chủ", reqId: req.id });
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
    logger.info(`Promo code created: ${promo.code}`, { reqId: req.id, promoId: promo.id });
    res.json(promo);
  } catch (error) {
    logger.error("Create promo error", error, { reqId: req.id });
    res.status(500).json({ error: "Lỗi tạo mã giảm giá", reqId: req.id });
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
    logger.info(`Promo code updated & cache invalidated: ${promo.code}`, { reqId: req.id });
    res.json(promo);
  } catch (error) {
    logger.error("Update promo error", error, { reqId: req.id });
    res.status(500).json({ error: "Lỗi cập nhật mã giảm giá", reqId: req.id });
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
    logger.info(`Promo code deleted & cache invalidated: ${promo.code}`, { reqId: req.id });
    res.json({ success: true });
  } catch (error) {
    logger.error("Delete promo error", error, { reqId: req.id });
    res.status(500).json({ error: "Lỗi xóa mã giảm giá", reqId: req.id });
  }
};

export const validatePromoCode = async (req: Request, res: Response) => {
  try {
    const { code, subtotal } = req.body;
    
    if (!code || subtotal === undefined) {
      return res.status(400).json({ success: false, error: "Thiếu code hoặc subtotal", reqId: req.id });
    }

    const cacheKey = `promo:${code.toUpperCase()}`;
    let promo = null;

    const cachedPromo = await redis.get(cacheKey);
    if (cachedPromo) {
      promo = JSON.parse(cachedPromo);
      logger.race(`Promo code cache HIT: ${code}`, { reqId: req.id });
    } else {
      promo = await prisma.promoCode.findUnique({
        where: { code: code.toUpperCase() }
      });
      if (promo) {
        await redis.set(cacheKey, JSON.stringify(promo), 'EX', 3600); // 1 giờ TTL
        logger.race(`Promo code cache MISS -> DB read & cached: ${code}`, { reqId: req.id });
      }
    }

    if (!promo || !promo.isActive) {
      logger.warn(`Promo validate failed: inactive or not found: ${code}`, { reqId: req.id });
      return res.status(400).json({ success: false, error: "Mã khuyến mãi không hợp lệ hoặc đã bị khóa.", reqId: req.id });
    }

    if (promo.expiresAt && new Date() > new Date(promo.expiresAt)) {
      logger.warn(`Promo validate failed: expired: ${code}`, { reqId: req.id, expiresAt: promo.expiresAt });
      return res.status(400).json({ success: false, error: "Mã khuyến mãi đã hết hạn sử dụng.", reqId: req.id });
    }

    if (promo.usageLimit !== null && promo.usedCount >= promo.usageLimit) {
      logger.warn(`Promo validate failed: usage limit reached: ${code} (${promo.usedCount}/${promo.usageLimit})`, { reqId: req.id });
      return res.status(400).json({ success: false, error: "Mã khuyến mãi đã hết lượt sử dụng.", reqId: req.id });
    }

    if (subtotal < promo.minOrderValue) {
      logger.warn(`Promo validate failed: minOrderValue not reached: ${code} (${subtotal} < ${promo.minOrderValue})`, { reqId: req.id });
      return res.status(400).json({ success: false, error: `Đơn hàng chưa đạt giá trị tối thiểu ${promo.minOrderValue.toLocaleString("vi-VN")}đ để sử dụng mã này.`, reqId: req.id });
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

    logger.race(`Promo validate SUCCESS: ${code} -> discount: ${discount}`, { reqId: req.id, code: promo.code, discount });
    res.json({ success: true, discount, code: promo.code, reqId: req.id });
  } catch (error) {
    logger.error("Validate promo error", error, { reqId: req.id });
    res.status(500).json({ error: "Lỗi máy chủ", reqId: req.id });
  }
};
