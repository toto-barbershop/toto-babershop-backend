import { Router } from "express";
import { submitMessage, getAllMessages, updateMessageStatus, deleteMessage } from "../controllers/messageController.js";
import { authenticateToken, requireAdmin } from "../middlewares/authMiddleware.js";

const router = Router();

// Public route for customers submitting a message
router.post("/", submitMessage);

// Admin routes
router.get("/", authenticateToken, requireAdmin, getAllMessages);
router.put("/:id/status", authenticateToken, requireAdmin, updateMessageStatus);
router.delete("/:id", authenticateToken, requireAdmin, deleteMessage);

export default router;
