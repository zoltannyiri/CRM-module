import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import requireOrganization from "../middleware/requireOrganization.js";
import viewPreferenceController from "../controllers/viewPreferenceController.js";

const router = express.Router();
router.use(authMiddleware, requireOrganization);
router.get("/:entityType", viewPreferenceController.getPreference);
router.put("/:entityType", viewPreferenceController.putPreference);
router.delete("/:entityType", viewPreferenceController.deletePreference);
export default router;
