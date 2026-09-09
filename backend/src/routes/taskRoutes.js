import express from "express";

import taskController from "../controllers/taskController.js";
import authMiddleware from "../middleware/authMiddleware.js";
import requireOrganization from "../middleware/requireOrganization.js";
import requireModule from "../middleware/requireModule.js";
import requirePermission from "../middleware/requirePermission.js";

const router = express.Router();

router.use(authMiddleware, requireOrganization, requireModule("TASKS"));

router.get("/", requirePermission("TASKS_VIEW"), taskController.getTasks);
router.get("/:id", requirePermission("TASKS_VIEW"), taskController.getTaskById);
router.post("/", requirePermission("TASKS_CREATE"), taskController.createTask);
router.patch("/:id", requirePermission("TASKS_EDIT"), taskController.updateTask);
router.delete("/:id", requirePermission("TASKS_DELETE"), taskController.deleteTask);

export default router;
