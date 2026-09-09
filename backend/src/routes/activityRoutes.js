import express from "express";

import activityController from "../controllers/activityController.js";
import authMiddleware from "../middleware/authMiddleware.js";
import requireOrganization from "../middleware/requireOrganization.js";

const router = express.Router();

router.get("/", authMiddleware, requireOrganization, activityController.getActivities);

export default router;
