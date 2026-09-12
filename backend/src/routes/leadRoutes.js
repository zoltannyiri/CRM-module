import express from "express";
import leadController from "../controllers/leadController.js";
import authMiddleware from "../middleware/authMiddleware.js";
import requireOrganization from "../middleware/requireOrganization.js";
import requireModule from "../middleware/requireModule.js";
import requirePermission from "../middleware/requirePermission.js";

const router = express.Router();
router.use(authMiddleware, requireOrganization, requireModule("LEADS"));
router.get("/", requirePermission("LEADS_VIEW"), leadController.getLeads);
router.get("/:id", requirePermission("LEADS_VIEW"), leadController.getLeadById);
router.post("/", requirePermission("LEADS_CREATE"), leadController.createLead);
router.patch("/:id", requirePermission("LEADS_EDIT"), leadController.updateLead);
router.delete("/:id", requirePermission("LEADS_DELETE"), leadController.deleteLead);
export default router;
