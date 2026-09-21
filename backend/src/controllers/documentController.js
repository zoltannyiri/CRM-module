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
  "image/webp",
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
const DOCUMENT_ENTITY_TYPES = new Set(["PARTNER", "PROJECT", "OFFER", "INCOMING_INVOICE"]);
export const DOCUMENT_TYPES = new Set(["GENERAL", "CONTRACT", "INVOICE", "RECEIPT", "QUOTE", "PROJECT_FILE", "OTHER"]);
const LEGACY_DOCUMENT_TYPES = new Map([
  ["ÁLTALÁNOS", "GENERAL"],
  ["SZERZŐDÉS", "CONTRACT"],
  ["MŰSZAKI DOKUMENTUM", "PROJECT_FILE"],
  ["PÉNZÜGYI DOKUMENTUM", "INVOICE"],
  ["SZÁMLA", "INVOICE"],
  ["NYUGTA", "RECEIPT"],
  ["NYUGTA / BIZONYLAT", "RECEIPT"],
  ["AJÁNLAT", "QUOTE"],
  ["PROJEKTFÁJL", "PROJECT_FILE"],
  ["EGYÉB", "OTHER"],
]);

export function normalizeDocumentType(value) {
  if (value === undefined || value === null || value === "") return null;
  const upper = String(value).trim().toUpperCase();
  if (DOCUMENT_TYPES.has(upper)) return upper;
  if (LEGACY_DOCUMENT_TYPES.has(upper)) return LEGACY_DOCUMENT_TYPES.get(upper);
  return null;
}
const ALLOWED_EXTENSIONS_BY_MIME = new Map([
  ["application/pdf", new Set([".pdf"])],
  ["application/msword", new Set([".doc"])],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", new Set([".docx"])],
  ["application/vnd.ms-excel", new Set([".xls"])],
  ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", new Set([".xlsx"])],
  ["text/csv", new Set([".csv"])],
  ["text/plain", new Set([".txt"])],
  ["image/jpeg", new Set([".jpg", ".jpeg"])],
  ["image/png", new Set([".png"])],
  ["image/webp", new Set([".webp"])],
]);

export function validateUploadMetadata(originalName, mimeType) {
  const ext = path.extname(originalName || "").toLowerCase();
  if (DISALLOWED_EXTENSIONS.has(ext)) return "Végrehajtható fájlok feltöltése nem engedélyezett.";
  if (!ALLOWED_MIME_TYPES.has(mimeType)) return "Ez a fájltípus nem támogatott.";
  if (!ALLOWED_EXTENSIONS_BY_MIME.get(mimeType)?.has(ext)) return "A fájl kiterjesztése és MIME-típusa nem egyezik.";
  return null;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
  fileFilter(req, file, cb) {
    const validationError = validateUploadMetadata(file.originalname, file.mimetype);
    if (validationError) {
      const error = new Error(validationError);
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
    const rawDocumentType = req.query.documentType || req.query.category;
    let documentType = undefined;
    if (rawDocumentType && String(rawDocumentType).toUpperCase() !== "ALL") {
      documentType = normalizeDocumentType(rawDocumentType);
      if (!documentType) return res.status(400).json({ message: "Érvénytelen dokumentumtípus." });
    }
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
      documentType,
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

    const rawType = req.body.documentType || req.body.category;
    const documentType = rawType !== undefined && rawType !== "" ? normalizeDocumentType(rawType) : "GENERAL";
    if (!documentType) return res.status(400).json({ message: "Érvénytelen dokumentumtípus." });
    const description = typeof (req.body.description ?? req.body.note) === "string" ? String(req.body.description ?? req.body.note).trim() : null;

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

    let offerId = null;
    if (req.body.offerId !== undefined && req.body.offerId !== "") {
      offerId = parsePositiveId(req.body.offerId);
      if (!offerId) return res.status(400).json({ message: "Érvénytelen ajánlatazonosító." });
    }
    let incomingInvoiceId = null;
    if (req.body.incomingInvoiceId !== undefined && req.body.incomingInvoiceId !== "") {
      incomingInvoiceId = parsePositiveId(req.body.incomingInvoiceId);
      if (!incomingInvoiceId) return res.status(400).json({ message: "Érvénytelen számlaazonosító." });
    }

    const document = await documentService.createDocument({
      organizationId: req.organization.id,
      actorMemberId: req.membership?.id || null,
      membership: req.membership,
      file: req.file,
      name,
      documentType,
      description,
      partnerId,
      projectId,
      offerId,
      incomingInvoiceId,
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

    if (body.documentType !== undefined || body.category !== undefined) {
      const rawType = body.documentType ?? body.category;
      const documentType = normalizeDocumentType(rawType);
      if (!documentType) return res.status(400).json({ message: "Érvénytelen dokumentumtípus." });
      data.documentType = documentType;
    }

    if (body.description !== undefined || body.note !== undefined) {
      const value = body.description ?? body.note;
      data.description = typeof value === "string" && value.trim() ? value.trim() : null;
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

export async function addLink(req, res, next) {
  try {
    const documentId = parsePositiveId(req.params.id);
    const entityId = parsePositiveId(req.body?.entityId);
    const entityType = typeof req.body?.entityType === "string" ? req.body.entityType.toUpperCase() : "";
    if (!documentId || !entityId || !DOCUMENT_ENTITY_TYPES.has(entityType)) return res.status(400).json({ message: "Érvénytelen dokumentumkapcsolat." });
    const link = await documentService.addDocumentLink({ organizationId: req.organization.id, membership: req.membership, actorMemberId: req.membership.id, documentId, entityType, entityId });
    if (!link) return res.status(404).json({ message: "A dokumentum nem található." });
    return res.status(201).json(link);
  } catch (error) { return next(error); }
}

export async function removeLink(req, res, next) {
  try {
    const documentId = parsePositiveId(req.params.id);
    const linkId = parsePositiveId(req.params.linkId);
    if (!documentId || !linkId) return res.status(400).json({ message: "Érvénytelen dokumentumkapcsolat." });
    const removed = await documentService.removeDocumentLink({ organizationId: req.organization.id, actorMemberId: req.membership.id, documentId, linkId });
    if (!removed) return res.status(404).json({ message: "A dokumentumkapcsolat nem található." });
    return res.json({ message: "A dokumentumkapcsolat eltávolítva." });
  } catch (error) { return next(error); }
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
  addLink,
  removeLink,
};
