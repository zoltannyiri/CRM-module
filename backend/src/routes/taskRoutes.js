import express from "express";

import taskController from "../controllers/taskController.js";
import authMiddleware from "../middleware/authMiddleware.js";
import requireOrganization from "../middleware/requireOrganization.js";

const router = express.Router();

router.get("/", authMiddleware, requireOrganization, taskController.getTasks);
router.get("/:id", authMiddleware, requireOrganization, taskController.getTaskById);
router.post("/", authMiddleware, requireOrganization, taskController.createTask);
router.patch("/:id", authMiddleware, requireOrganization, taskController.updateTask);
router.delete("/:id", authMiddleware, requireOrganization, taskController.deleteTask);

export default router;
