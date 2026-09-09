import express from "express";

import memberController from "../controllers/memberController.js";
import authMiddleware from "../middleware/authMiddleware.js";
import requireOrganization from "../middleware/requireOrganization.js";
import adminMiddleware from "../middleware/adminMiddleware.js";

const router = express.Router();

router.use(authMiddleware, requireOrganization);

router.get("/", memberController.getMembers);
router.get("/:id/permissions", adminMiddleware, memberController.getMemberPermissions);
router.patch("/:id/permissions", adminMiddleware, memberController.updateMemberPermissions);

export default router;
