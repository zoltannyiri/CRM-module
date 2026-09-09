import express from "express";

import projectController from "../controllers/projectController.js";
import authMiddleware from "../middleware/authMiddleware.js";
import requireOrganization from "../middleware/requireOrganization.js";

const router = express.Router();

router.get("/", authMiddleware, requireOrganization, projectController.getProjects);
router.get("/:id", authMiddleware, requireOrganization, projectController.getProjectById);
router.post("/", authMiddleware, requireOrganization, projectController.createProject);
router.patch("/:id", authMiddleware, requireOrganization, projectController.updateProject);
router.delete("/:id", authMiddleware, requireOrganization, projectController.deleteProject);

export default router;
