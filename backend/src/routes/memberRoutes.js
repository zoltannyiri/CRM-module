import express from "express";

import memberController from "../controllers/memberController.js";
import authMiddleware from "../middleware/authMiddleware.js";
import requireOrganization from "../middleware/requireOrganization.js";

const router = express.Router();

router.get("/", authMiddleware, requireOrganization, memberController.getMembers);

export default router;
