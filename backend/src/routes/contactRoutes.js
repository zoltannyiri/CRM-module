import express from "express";

import contactController from "../controllers/contactController.js";
import authMiddleware from "../middleware/authMiddleware.js";
import requireOrganization from "../middleware/requireOrganization.js";
import requireModule from "../middleware/requireModule.js";
import requirePermission from "../middleware/requirePermission.js";

const router = express.Router();

router.use(authMiddleware, requireOrganization, requireModule("PARTNERS"));

router.get("/", requirePermission("PARTNERS_VIEW"), contactController.getContacts);
router.get("/export", requirePermission("PARTNERS_VIEW"), contactController.exportContacts);
router.get("/:id", requirePermission("PARTNERS_VIEW"), contactController.getContactById);
router.post("/", requirePermission("PARTNERS_CREATE"), contactController.createContact);
router.patch("/:id", requirePermission("PARTNERS_EDIT"), contactController.updateContact);
router.delete("/:id", requirePermission("PARTNERS_DELETE"), contactController.deleteContact);

export default router;
