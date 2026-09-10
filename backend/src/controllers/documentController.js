import path from "node:path";
import multer from "multer";

import documentService from "../services/documentService.js";
import storageService from "../services/storageService.js";

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "text/plain",
  "image/jpeg",
  "image/png",
]);

const DISALLOWED_EXTENSIONS = new Set([
  ".exe",
  ".bat",
  ".cmd",
  ".js",
  ".ps1",
  ".dll",
  ".sh",
  ".vbs",
  ".msi",
  ".com",
  ".scr",
  ".jar",
]);
const DOCUMENT_ENTITY_TYPES = new Set(["PARTNER", "PROJECT"]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
  fileFilter(req, file, cb) {
    const ext = path.extname(file.originalname || "").toLowerCase();
    if (DISALLOWED_EXTENSIONS.has(ext)) {
      const error = new Error("Végrehajtható fájlok feltöltése nem engedélyezett.");
      error.statusCode = 400;
      return cb(error);
    }

    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      const error = new Error("Ez a fájltípus nem támogatott. Engedélyezett: PDF, DOC, DOCX, XLS, XLSX, CSV, TXT, JPG, PNG.");
      error.statusCode = 400;
      return cb(error);
    }

    cb(null, true);
  },
});

export const uploadMiddleware = (req, res, next) => {
  upload.single("file")(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(413).json({ message: "A fájl mérete meghaladja a megengedett 20 MB-os korlátot." });
        }
        return res.status(400).json({ message: `Feltöltési hiba: ${err.message}` });
      }
      return res.status(err.statusCode || 400).json({ message: err.message });
    }
    if (req.file && req.file.originalname) {
      try {
        req.file.originalname = Buffer.from(req.file.originalname, "latin1").toString("utf8");
      } catch {
        // keep original if decoding fails
      }
    }
    next();
  });
};

function parsePositiveId(value) {
  if (value === null || value === undefined || value === "") return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function getDocuments(req, res, next) {
  try {
    const query = String(req.query.q || "");
    const category = req.query.category ? String(req.query.category) : undefined;
    const entityType = req.query.entityType ? String(req.query.entityType).toUpperCase() : undefined;
    const entityId = parsePositiveId(req.query.entityId);
    const sortDirection = req.query.sortDirection === "asc" ? "asc" : "desc";

    if (entityType && !DOCUMENT_ENTITY_TYPES.has(entityType)) {
      return res.status(400).json({ message: "Érvénytelen dokumentumkapcsolat-típus." });
    }
    if ((entityType && !entityId) || (!entityType && req.query.entityId !== undefined)) {
      return res.status(400).json({ message: "Az entityType és egy pozitív entityId együtt adandó meg." });
    }

    const documents = await documentService.getDocuments({
      organizationId: req.organization.id,
      membership: req.membership,
      query,
      category,
      entityType,
      entityId,
      sortDirection,
    });

    return res.json(documents);
  } catch (error) {
    return next(error);
  }
}

export async function getDocumentById(req, res, next) {
  try {
    const documentId = parsePositiveId(req.params.id);
    if (!documentId) {
      return res.status(400).json({ message: "Érvénytelen dokumentum azonosító." });
    }

    const document = await documentService.getDocumentById({
      organizationId: req.organization.id,
      membership: req.membership,
      documentId,
    });

    if (!document) {
      return res.status(404).json({ message: "A dokumentum nem található." });
    }

    return res.json(document);
  } catch (error) {
    return next(error);
  }
}

export async function createDocument(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Fájl feltöltése kötelező." });
    }

    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    if (!name) {
      return res.status(400).json({ message: "A dokumentum megnevezése kötelező." });
    }

    const category = typeof req.body.category === "string" ? req.body.category.trim() : null;
    const note = typeof req.body.note === "string" ? req.body.note.trim() : null;

    let partnerId = null;
    if (req.body.partnerId !== undefined && req.body.partnerId !== "") {
      partnerId = parsePositiveId(req.body.partnerId);
      if (!partnerId) {
        return res.status(400).json({ message: "Érvénytelen partner azonosító." });
      }
    }

    let projectId = null;
    if (req.body.projectId !== undefined && req.body.projectId !== "") {
      projectId = parsePositiveId(req.body.projectId);
      if (!projectId) {
        return res.status(400).json({ message: "Érvénytelen projekt azonosító." });
      }
    }

    const document = await documentService.createDocument({
      organizationId: req.organization.id,
      actorMemberId: req.membership?.id || null,
      membership: req.membership,
      file: req.file,
      name,
      category,
      note,
      partnerId,
      projectId,
    });

    return res.status(201).json(document);
  } catch (error) {
    return next(error);
  }
}

export async function updateDocument(req, res, next) {
  try {
    const documentId = parsePositiveId(req.params.id);
    if (!documentId) {
      return res.status(400).json({ message: "Érvénytelen dokumentum azonosító." });
    }

    const body = req.body || {};
    const data = {};

    if (body.name !== undefined) {
      if (typeof body.name !== "string" || !body.name.trim()) {
        return res.status(400).json({ message: "A megnevezés kitöltése kötelező." });
      }
      data.name = body.name.trim();
    }

    if (body.category !== undefined) {
      data.category = typeof body.category === "string" && body.category.trim() ? body.category.trim() : null;
    }

    if (body.note !== undefined) {
      data.note = typeof body.note === "string" && body.note.trim() ? body.note.trim() : null;
    }

    if (body.partnerId !== undefined) {
      data.partnerId = parsePositiveId(body.partnerId);
      if (body.partnerId !== null && body.partnerId !== "" && !data.partnerId) {
        return res.status(400).json({ message: "Érvénytelen partner azonosító." });
      }
    }

    if (body.projectId !== undefined) {
      data.projectId = parsePositiveId(body.projectId);
      if (body.projectId !== null && body.projectId !== "" && !data.projectId) {
        return res.status(400).json({ message: "Érvénytelen projekt azonosító." });
      }
    }

    const updated = await documentService.updateDocument({
      organizationId: req.organization.id,
      actorMemberId: req.membership?.id || null,
      membership: req.membership,
      documentId,
      data,
    });

    if (!updated) {
      return res.status(404).json({ message: "A dokumentum nem található." });
    }

    return res.json(updated);
  } catch (error) {
    return next(error);
  }
}

export async function deleteDocument(req, res, next) {
  try {
    const documentId = parsePositiveId(req.params.id);
    if (!documentId) {
      return res.status(400).json({ message: "Érvénytelen dokumentum azonosító." });
    }

    const deleted = await documentService.deleteDocument({
      organizationId: req.organization.id,
      actorMemberId: req.membership?.id || null,
      documentId,
    });

    if (!deleted) {
      return res.status(404).json({ message: "A dokumentum nem található." });
    }

    return res.json({ message: "A dokumentum sikeresen törölve." });
  } catch (error) {
    return next(error);
  }
}

export async function downloadDocument(req, res, next) {
  try {
    const documentId = parsePositiveId(req.params.id);
    if (!documentId) {
      return res.status(400).json({ message: "Érvénytelen dokumentum azonosító." });
    }

    const document = await documentService.getDocumentForDownload({
      organizationId: req.organization.id,
      documentId,
    });

    if (!document) {
      return res.status(404).json({ message: "A dokumentum nem található." });
    }

    const file = await storageService.getFile({ storageKey: document.storageKey });
    if (!file) {
      return res.status(404).json({ message: "A fájl nem található a tárolóban." });
    }

    const safeFilename = encodeURIComponent(document.originalFileName).replace(/['()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
    const asciiFilename = document.originalFileName.replace(/[^\x20-\x7E]|["\\]/g, "_");

    res.setHeader("Content-Type", document.mimeType || "application/octet-stream");
    res.setHeader("Content-Length", file.size);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${asciiFilename}"; filename*=UTF-8''${safeFilename}`,
    );

    const stream = file.createReadStream();
    stream.on("error", (err) => next(err));
    stream.pipe(res);
  } catch (error) {
    return next(error);
  }
}

export default {
  uploadMiddleware,
  getDocuments,
  getDocumentById,
  createDocument,
  updateDocument,
  deleteDocument,
  downloadDocument,
};
