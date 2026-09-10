import express from "express";

import offerController from "../controllers/offerController.js";
import authMiddleware from "../middleware/authMiddleware.js";
import requireOrganization from "../middleware/requireOrganization.js";
import requireModule from "../middleware/requireModule.js";
import requirePermission from "../middleware/requirePermission.js";

const router = express.Router();

router.use(authMiddleware, requireOrganization, requireModule("OFFERS"));
router.get("/", requirePermission("OFFERS_VIEW"), offerController.getOffers);
router.get("/:id", requirePermission("OFFERS_VIEW"), offerController.getOfferById);
router.post("/", requirePermission("OFFERS_CREATE"), offerController.createOffer);
router.patch("/:id", requirePermission("OFFERS_EDIT"), offerController.updateOffer);
router.delete("/:id", requirePermission("OFFERS_DELETE"), offerController.deleteOffer);

export default router;
