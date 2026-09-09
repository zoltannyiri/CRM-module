import express from "express";

import activityController from "../controllers/activityController.js";
import authMiddleware from "../middleware/authMiddleware.js";
import requireOrganization from "../middleware/requireOrganization.js";
import requirePermission from "../middleware/requirePermission.js";

const router = express.Router();

router.get("/", authMiddleware, requireOrganization, requirePermission("ACTIVITY_VIEW"), activityController.getActivities);

export default router;
