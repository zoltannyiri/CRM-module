import express from "express";

import {
	validateInvitation,
	register,
	login,
	refresh,
	logout,
	me,
} from "../controllers/authController.js";

import authMiddleware from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/invitation/:token", validateInvitation);

router.post("/register/:token", register);

router.post("/login", login);

router.post("/refresh", refresh);

router.post("/logout", logout);

router.get("/me", authMiddleware, me);

export default router;