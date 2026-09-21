import express from "express";

import controller from "../controllers/incomingInvoiceController.js";
import authMiddleware from "../middleware/authMiddleware.js";
import requireOrganization from "../middleware/requireOrganization.js";
import requireModule from "../middleware/requireModule.js";
import requirePermission from "../middleware/requirePermission.js";

const router = express.Router();

router.use(authMiddleware, requireOrganization, requireModule("INCOMING_INVOICES"));
router.get("/", requirePermission("INCOMING_INVOICES_VIEW"), controller.list);
router.get("/:id", requirePermission("INCOMING_INVOICES_VIEW"), controller.show);
router.post("/", requirePermission("INCOMING_INVOICES_CREATE"), controller.create);
router.patch("/:id", requirePermission("INCOMING_INVOICES_EDIT"), controller.update);
router.delete("/:id", requirePermission("INCOMING_INVOICES_DELETE"), controller.remove);

export default router;
