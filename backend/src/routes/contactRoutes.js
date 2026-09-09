import express from "express";

import contactController from "../controllers/contactController.js";
import authMiddleware from "../middleware/authMiddleware.js";
import requireOrganization from "../middleware/requireOrganization.js";
import requireModule from "../middleware/requireModule.js";

const router = express.Router();

router.use(authMiddleware, requireOrganization, requireModule("PARTNERS"));

router.get("/", contactController.getContacts);
router.get("/export", contactController.exportContacts);
router.get("/:id", contactController.getContactById);
router.post("/", contactController.createContact);
router.patch("/:id", contactController.updateContact);
router.delete("/:id", contactController.deleteContact);

export default router;
