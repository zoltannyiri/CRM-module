import express from "express";

import projectController from "../controllers/projectController.js";
import authMiddleware from "../middleware/authMiddleware.js";
import requireOrganization from "../middleware/requireOrganization.js";
import requireModule from "../middleware/requireModule.js";
import requirePermission from "../middleware/requirePermission.js";

const router = express.Router();

router.use(authMiddleware, requireOrganization, requireModule("PROJECTS"));

router.get("/", requirePermission("PROJECTS_VIEW"), projectController.getProjects);
router.get("/:id", requirePermission("PROJECTS_VIEW"), projectController.getProjectById);
router.post("/", requirePermission("PROJECTS_CREATE"), projectController.createProject);
router.patch("/:id", requirePermission("PROJECTS_EDIT"), projectController.updateProject);
router.delete("/:id", requirePermission("PROJECTS_DELETE"), projectController.deleteProject);

export default router;
