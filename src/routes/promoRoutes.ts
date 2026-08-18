import { Router } from "express";
import { validatePromoCode, getAllPromoCodes, createPromoCode, updatePromoCode, deletePromoCode } from "../controllers/promoController.js";
import { authenticateToken, requireAdmin } from "../middlewares/authMiddleware.js";

const router = Router();

router.get("/", authenticateToken, requireAdmin, getAllPromoCodes);
router.post("/", authenticateToken, requireAdmin, createPromoCode);
router.put("/:id", authenticateToken, requireAdmin, updatePromoCode);
router.delete("/:id", authenticateToken, requireAdmin, deletePromoCode);

router.post("/validate", validatePromoCode);

export default router;
