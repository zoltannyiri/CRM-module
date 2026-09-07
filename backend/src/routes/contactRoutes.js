import express from "express";

import contactController from "../controllers/contactController.js";
import authMiddleware from "../middleware/authMiddleware.js";
import requireOrganization from "../middleware/requireOrganization.js";

const router = express.Router();

router.get("/", authMiddleware, requireOrganization, contactController.getContacts);
router.get("/export", authMiddleware, requireOrganization, contactController.exportContacts);
router.get("/:id", authMiddleware, requireOrganization, contactController.getContactById);
router.post("/", authMiddleware, requireOrganization, contactController.createContact);
router.patch("/:id", authMiddleware, requireOrganization, contactController.updateContact);
router.delete("/:id", authMiddleware, requireOrganization, contactController.deleteContact);

export default router;
