import express from "express";
import dashboardController from "../controllers/dashboardController.js";
import authMiddleware from "../middleware/authMiddleware.js";
import requireOrganization from "../middleware/requireOrganization.js";

const router = express.Router();
router.get("/", authMiddleware, requireOrganization, dashboardController.getDashboard);
export default router;
