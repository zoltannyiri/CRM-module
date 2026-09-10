import express from "express";

import documentController, { uploadMiddleware } from "../controllers/documentController.js";
import authMiddleware from "../middleware/authMiddleware.js";
import requireOrganization from "../middleware/requireOrganization.js";
import requireModule from "../middleware/requireModule.js";
import requirePermission from "../middleware/requirePermission.js";

const router = express.Router();

router.get(
  "/",
  authMiddleware,
  requireOrganization,
  requireModule("DOCUMENTS"),
  requirePermission("DOCUMENTS_VIEW"),
  documentController.getDocuments,
);

router.get(
  "/:id",
  authMiddleware,
  requireOrganization,
  requireModule("DOCUMENTS"),
  requirePermission("DOCUMENTS_VIEW"),
  documentController.getDocumentById,
);

router.post(
  "/",
  authMiddleware,
  requireOrganization,
  requireModule("DOCUMENTS"),
  requirePermission("DOCUMENTS_CREATE"),
  uploadMiddleware,
  documentController.createDocument,
);

router.patch(
  "/:id",
  authMiddleware,
  requireOrganization,
  requireModule("DOCUMENTS"),
  requirePermission("DOCUMENTS_EDIT"),
  documentController.updateDocument,
);

router.delete(
  "/:id",
  authMiddleware,
  requireOrganization,
  requireModule("DOCUMENTS"),
  requirePermission("DOCUMENTS_DELETE"),
  documentController.deleteDocument,
);

router.get(
  "/:id/download",
  authMiddleware,
  requireOrganization,
  requireModule("DOCUMENTS"),
  requirePermission("DOCUMENTS_DOWNLOAD"),
  documentController.downloadDocument,
);

export default router;
