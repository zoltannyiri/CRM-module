import express from "express";

import projectController from "../controllers/projectController.js";
import authMiddleware from "../middleware/authMiddleware.js";
import requireOrganization from "../middleware/requireOrganization.js";
import requireModule from "../middleware/requireModule.js";

const router = express.Router();

router.use(authMiddleware, requireOrganization, requireModule("PROJECTS"));

router.get("/", projectController.getProjects);
router.get("/:id", projectController.getProjectById);
router.post("/", projectController.createProject);
router.patch("/:id", projectController.updateProject);
router.delete("/:id", projectController.deleteProject);

export default router;
