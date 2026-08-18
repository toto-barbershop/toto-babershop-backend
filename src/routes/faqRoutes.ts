import { Router } from "express";
import { getAllFaqs, createFaq, updateFaq, deleteFaq } from "../controllers/faqController.js";
import { authenticateToken, requireAdmin } from "../middlewares/authMiddleware.js";

const router = Router();

router.get("/", getAllFaqs);
router.post("/", authenticateToken, requireAdmin, createFaq);
router.put("/:id", authenticateToken, requireAdmin, updateFaq);
router.delete("/:id", authenticateToken, requireAdmin, deleteFaq);

export default router;
