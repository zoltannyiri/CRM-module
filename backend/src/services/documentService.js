import prisma from "../lib/prisma.js";
import activityService from "./activityService.js";
import storageService from "./storageService.js";
import { getEnabledModules } from "./organizationModuleService.js";
import { getEffectivePermissions } from "./permissionService.js";

const documentInclude = {
  uploadedByMember: {
    select: {
      id: true,
      role: true,
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    },
  },
  links: true,
};

export class DocumentServiceError extends Error {
  constructor(message, statusCode, details = {}) {
    super(message);
    this.statusCode = statusCode;
    Object.assign(this, details);
  }
}

function toPublicDocument(document, relations = {}) {
  const { storageKey: _storageKey, links: _links, ...safeDocument } = document;
  return { ...safeDocument, ...relations };
}

async function checkEntityAccess(organizationId, membership, client = prisma) {
  const [enabledModules, effectivePermissions] = await Promise.all([
    getEnabledModules(organizationId, client),
    getEffectivePermissions(membership, client),
  ]);
  const modules = new Set(enabledModules);
  const perms = new Set(effectivePermissions);

  const canViewPartners = modules.has("PARTNERS") && perms.has("PARTNERS_VIEW");
  const canViewProjects = modules.has("PROJECTS") && perms.has("PROJECTS_VIEW");

  return { canViewPartners, canViewProjects };
}

async function attachEntitiesToDocuments(documents, organizationId, canViewPartners, canViewProjects, client = prisma) {
  if (!documents || documents.length === 0) return [];

  const partnerIds = new Set();
  const projectIds = new Set();

  for (const doc of documents) {
    for (const link of doc.links || []) {
      if (link.entityType === "PARTNER") partnerIds.add(link.entityId);
      if (link.entityType === "PROJECT") projectIds.add(link.entityId);
    }
  }

  const [partners, projects] = await Promise.all([
    canViewPartners && partnerIds.size > 0
      ? client.partner.findMany({
          where: { organizationId, id: { in: [...partnerIds] } },
          select: { id: true, name: true },
        })
      : [],
    canViewProjects && projectIds.size > 0
      ? client.project.findMany({
          where: { organizationId, id: { in: [...projectIds] } },
          select: { id: true, name: true },
        })
      : [],
  ]);

  const partnerMap = new Map((partners || []).map((p) => [p.id, p]));
  const projectMap = new Map((projects || []).map((p) => [p.id, p]));

  return documents.map((doc) => {
    let partner = null;
    let project = null;

    for (const link of doc.links || []) {
      if (link.entityType === "PARTNER" && canViewPartners) {
        partner = partnerMap.get(link.entityId) || null;
      }
      if (link.entityType === "PROJECT" && canViewProjects) {
        project = projectMap.get(link.entityId) || null;
      }
    }

    // Exclude internal storageKey from public responses
    return toPublicDocument(doc, { partner, project });
  });
}

async function validateLinkedEntities({
  organizationId,
  membership,
  partnerId,
  projectId,
  partnerIdProvided = partnerId != null,
  projectIdProvided = projectId != null,
}, client = prisma) {
  if (!partnerIdProvided && !projectIdProvided) return;
  const access = await checkEntityAccess(organizationId, membership, client);
  if (partnerIdProvided && !access.canViewPartners) {
    throw new DocumentServiceError("Nincs jogosultsága a partnerhez kapcsoláshoz.", 403, { code: "PERMISSION_DENIED", permission: "PARTNERS_VIEW" });
  }
  if (projectIdProvided && !access.canViewProjects) {
    throw new DocumentServiceError("Nincs jogosultsága a projekthez kapcsoláshoz.", 403, { code: "PERMISSION_DENIED", permission: "PROJECTS_VIEW" });
  }
  const [partner, project] = await Promise.all([
    partnerId != null ? client.partner.findFirst({ where: { id: partnerId, organizationId }, select: { id: true } }) : true,
    projectId != null ? client.project.findFirst({ where: { id: projectId, organizationId }, select: { id: true } }) : true,
  ]);
  if (!partner) throw new DocumentServiceError("A megadott partner nem található.", 404);
  if (!project) throw new DocumentServiceError("A megadott projekt nem található.", 404);
}

/**
 * Retrieves documents with optional filtering (search, category, entityType, entityId).
 */
export async function getDocuments(
  {
    organizationId,
    membership,
    query = "",
    category,
    entityType,
    entityId,
    sortDirection = "desc",
  },
  client = prisma,
) {
  const { canViewPartners, canViewProjects } = await checkEntityAccess(
    organizationId,
    membership,
    client,
  );

  // If filtered by specific entity, enforce module & permission access
  if (entityType === "PARTNER" && !canViewPartners) {
    return [];
  }
  if (entityType === "PROJECT" && !canViewProjects) {
    return [];
  }

  const term = query.trim();
  const where = {
    organizationId,
    ...(term
      ? {
          OR: [
            { name: { contains: term, mode: "insensitive" } },
            { originalFileName: { contains: term, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(category ? { category } : {}),
    ...(entityType && entityId
      ? {
          links: {
            some: {
              entityType,
              entityId,
            },
          },
        }
      : {}),
  };

  const rawDocuments = await client.document.findMany({
    where,
    include: documentInclude,
    orderBy: {
      createdAt: sortDirection === "asc" ? "asc" : "desc",
    },
  });

  return attachEntitiesToDocuments(
    rawDocuments,
    organizationId,
    canViewPartners,
    canViewProjects,
    client,
  );
}

/**
 * Retrieves a single document by ID.
 */
export async function getDocumentById(
  { organizationId, membership, documentId },
  client = prisma,
) {
  const { canViewPartners, canViewProjects } = await checkEntityAccess(
    organizationId,
    membership,
    client,
  );

  const doc = await client.document.findFirst({
    where: { id: documentId, organizationId },
    include: documentInclude,
  });

  if (!doc) return null;

  const [attached] = await attachEntitiesToDocuments(
    [doc],
    organizationId,
    canViewPartners,
    canViewProjects,
    client,
  );

  return attached || null;
}

/**
 * Retrieves internal document record for secure download.
 */
export async function getDocumentForDownload(
  { organizationId, documentId },
  client = prisma,
) {
  return client.document.findFirst({
    where: { id: documentId, organizationId },
    select: {
      id: true,
      organizationId: true,
      originalFileName: true,
      mimeType: true,
      size: true,
      storageKey: true,
    },
  });
}

/**
 * Creates a new document with file upload and optional entity links.
 */
export async function createDocument({
  organizationId,
  actorMemberId,
  membership,
  file,
  name,
  category = null,
  note = null,
  partnerId = null,
  projectId = null,
}, client = prisma) {
  if (!file || !file.buffer) {
    throw new Error("Fájl megadása kötelező.");
  }
  if (!name || !name.trim()) {
    throw new Error("A megnevezés kitöltése kötelező.");
  }

  // 1. Save file to storage
  const savedFile = await storageService.saveFile({
    organizationId,
    buffer: file.buffer,
    originalFileName: file.originalname,
  });

  // 2. Transaction: Document + Links + Activity
  try {
    return await client.$transaction(async (tx) => {
      await validateLinkedEntities({ organizationId, membership, partnerId, projectId }, tx);

      const doc = await tx.document.create({
        data: {
          organizationId,
          name: name.trim(),
          originalFileName: file.originalname,
          mimeType: file.mimetype,
          size: savedFile.size,
          storageKey: savedFile.storageKey,
          category: category && category.trim() ? category.trim() : null,
          note: note && note.trim() ? note.trim() : null,
          uploadedByMemberId: actorMemberId || null,
        },
      });

      if (partnerId) {
        await tx.documentLink.create({
          data: {
            documentId: doc.id,
            entityType: "PARTNER",
            entityId: partnerId,
          },
        });
      }

      if (projectId) {
        await tx.documentLink.create({
          data: {
            documentId: doc.id,
            entityType: "PROJECT",
            entityId: projectId,
          },
        });
      }

      await activityService.createActivity(
        {
          organizationId,
          actorMemberId,
          entityType: "DOCUMENT",
          entityId: doc.id,
          action: "CREATED",
          title: "Dokumentum feltöltve",
          description: doc.name,
          metadata: {
            name: doc.name,
            originalFileName: doc.originalFileName,
            size: doc.size,
            category: doc.category,
          },
        },
        tx,
      );

      const created = await tx.document.findFirst({
        where: { id: doc.id, organizationId },
        include: documentInclude,
      });

      return toPublicDocument(created);
    });
  } catch (error) {
    // Cleanup storage file on DB error
    await storageService.deleteFile({ storageKey: savedFile.storageKey });
    throw error;
  }
}

/**
 * Updates document metadata and links. File content cannot be replaced in edit mode.
 */
export async function updateDocument({
  organizationId,
  actorMemberId,
  membership,
  documentId,
  data,
}, client = prisma) {
  const { name, category, note, partnerId, projectId } = data;

  if (name !== undefined && (!name || !name.trim())) {
    throw new Error("A megnevezés kitöltése kötelező.");
  }

  return client.$transaction(async (tx) => {
    const existing = await tx.document.findFirst({
      where: { id: documentId, organizationId },
      include: { links: true },
    });
    if (!existing) return null;

    await validateLinkedEntities({
      organizationId,
      membership,
      partnerId,
      projectId,
      partnerIdProvided: partnerId !== undefined,
      projectIdProvided: projectId !== undefined,
    }, tx);

    const updateData = {};
    if (name !== undefined) updateData.name = name.trim();
    if (category !== undefined) {
      updateData.category = category && category.trim() ? category.trim() : null;
    }
    if (note !== undefined) {
      updateData.note = note && note.trim() ? note.trim() : null;
    }

    const updatedDoc = await tx.document.update({
      where: { id: documentId, organizationId },
      data: updateData,
    });

    // Handle link changes if provided
    if (partnerId !== undefined) {
      await tx.documentLink.deleteMany({
        where: { documentId, entityType: "PARTNER", document: { organizationId } },
      });
      if (partnerId) {
        await tx.documentLink.create({
          data: {
            documentId,
            entityType: "PARTNER",
            entityId: partnerId,
          },
        });
      }
    }
    if (projectId !== undefined) {
      await tx.documentLink.deleteMany({
        where: { documentId, entityType: "PROJECT", document: { organizationId } },
      });
      if (projectId) {
        await tx.documentLink.create({
          data: {
            documentId,
            entityType: "PROJECT",
            entityId: projectId,
          },
        });
      }
    }

    await activityService.createActivity(
      {
        organizationId,
        actorMemberId,
        entityType: "DOCUMENT",
        entityId: documentId,
        action: "UPDATED",
        title: "Dokumentum módosítva",
        description: updatedDoc.name,
      },
      tx,
    );

    const result = await tx.document.findFirst({
      where: { id: documentId, organizationId },
      include: documentInclude,
    });

    return toPublicDocument(result);
  });
}

/**
 * Deletes a document and its physical file.
 */
export async function deleteDocument({ organizationId, actorMemberId, documentId }, client = prisma) {
  const existing = await client.document.findFirst({
    where: { id: documentId, organizationId },
    select: { id: true, name: true, storageKey: true },
  });

  if (!existing) return false;

  const stagedFile = await storageService.stageFileDeletion({ storageKey: existing.storageKey });
  try {
    await client.$transaction(async (tx) => {
      await activityService.createActivity(
        {
          organizationId,
          actorMemberId,
          entityType: "DOCUMENT",
          entityId: documentId,
          action: "DELETED",
          title: "Dokumentum törölve",
          description: existing.name,
        },
        tx,
      );

      await tx.document.delete({
        where: { id: documentId, organizationId },
      });
    });
  } catch (error) {
    await stagedFile.rollback();
    throw error;
  }
  await stagedFile.commit();

  return true;
}

export default {
  getDocuments,
  getDocumentById,
  getDocumentForDownload,
  createDocument,
  updateDocument,
  deleteDocument,
};
