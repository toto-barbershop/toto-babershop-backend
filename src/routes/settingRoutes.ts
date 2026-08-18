import { Router } from "express";
import { getAllSettings, upsertSettings } from "../controllers/settingController.js";
import { authenticateToken, requireAdmin } from "../middlewares/authMiddleware.js";

const router = Router();

router.get("/", getAllSettings);
router.put("/", authenticateToken, requireAdmin, upsertSettings);

export default router;
