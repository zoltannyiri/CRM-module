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
  const canViewOffers = modules.has("OFFERS") && perms.has("OFFERS_VIEW");
  const canViewIncomingInvoices = modules.has("INCOMING_INVOICES") && perms.has("INCOMING_INVOICES_VIEW");

  return { canViewPartners, canViewProjects, canViewOffers, canViewIncomingInvoices };
}

async function attachEntitiesToDocuments(documents, organizationId, access, client = prisma) {
  if (!documents || documents.length === 0) return [];

  const partnerIds = new Set();
  const projectIds = new Set();
  const offerIds = new Set();
  const invoiceIds = new Set();

  for (const doc of documents) {
    for (const link of doc.links || []) {
      if (link.entityType === "PARTNER") partnerIds.add(link.entityId);
      if (link.entityType === "PROJECT") projectIds.add(link.entityId);
      if (link.entityType === "OFFER") offerIds.add(link.entityId);
      if (link.entityType === "INCOMING_INVOICE") invoiceIds.add(link.entityId);
    }
  }

  const [partners, projects, offers, incomingInvoices] = await Promise.all([
    access.canViewPartners && partnerIds.size > 0
      ? client.partner.findMany({
          where: { organizationId, id: { in: [...partnerIds] } },
          select: { id: true, name: true },
        })
      : [],
    access.canViewProjects && projectIds.size > 0
      ? client.project.findMany({
          where: { organizationId, id: { in: [...projectIds] } },
          select: { id: true, name: true },
        })
      : [],
    access.canViewOffers && offerIds.size > 0
      ? client.offer.findMany({ where: { organizationId, id: { in: [...offerIds] } }, select: { id: true, offerNumber: true } })
      : [],
    access.canViewIncomingInvoices && invoiceIds.size > 0
      ? client.incomingInvoice.findMany({ where: { organizationId, id: { in: [...invoiceIds] } }, select: { id: true, invoiceNumber: true } })
      : [],
  ]);

  const partnerMap = new Map((partners || []).map((p) => [p.id, p]));
  const projectMap = new Map((projects || []).map((p) => [p.id, p]));
  const offerMap = new Map((offers || []).map((value) => [value.id, value]));
  const invoiceMap = new Map((incomingInvoices || []).map((value) => [value.id, value]));

  return documents.map((doc) => {
    let partner = null;
    let project = null;
    let offer = null;
    let incomingInvoice = null;

    for (const link of doc.links || []) {
      if (link.entityType === "PARTNER" && access.canViewPartners) {
        partner = partnerMap.get(link.entityId) || null;
      }
      if (link.entityType === "PROJECT" && access.canViewProjects) {
        project = projectMap.get(link.entityId) || null;
      }
      if (link.entityType === "OFFER" && access.canViewOffers) offer = offerMap.get(link.entityId) || null;
      if (link.entityType === "INCOMING_INVOICE" && access.canViewIncomingInvoices) incomingInvoice = invoiceMap.get(link.entityId) || null;
    }

    // Exclude internal storageKey from public responses
    return toPublicDocument(doc, { partner, project, offer, incomingInvoice });
  });
}

async function validateLinkedEntities({
  organizationId,
  membership,
  partnerId,
  projectId,
  offerId,
  incomingInvoiceId,
  partnerIdProvided = partnerId != null,
  projectIdProvided = projectId != null,
  offerIdProvided = offerId != null,
  incomingInvoiceIdProvided = incomingInvoiceId != null,
}, client = prisma) {
  if (!partnerIdProvided && !projectIdProvided && !offerIdProvided && !incomingInvoiceIdProvided) return;
  const access = await checkEntityAccess(organizationId, membership, client);
  if (partnerIdProvided && !access.canViewPartners) {
    throw new DocumentServiceError("Nincs jogosultsága a partnerhez kapcsoláshoz.", 403, { code: "PERMISSION_DENIED", permission: "PARTNERS_VIEW" });
  }
  if (projectIdProvided && !access.canViewProjects) {
    throw new DocumentServiceError("Nincs jogosultsága a projekthez kapcsoláshoz.", 403, { code: "PERMISSION_DENIED", permission: "PROJECTS_VIEW" });
  }
  if (offerIdProvided && !access.canViewOffers) throw new DocumentServiceError("Nincs jogosultsága az ajánlathoz kapcsoláshoz.", 403, { code: "PERMISSION_DENIED", permission: "OFFERS_VIEW" });
  if (incomingInvoiceIdProvided && !access.canViewIncomingInvoices) throw new DocumentServiceError("Nincs jogosultsága a számlához kapcsoláshoz.", 403, { code: "PERMISSION_DENIED", permission: "INCOMING_INVOICES_VIEW" });
  const [partner, project, offer, incomingInvoice] = await Promise.all([
    partnerId != null ? client.partner.findFirst({ where: { id: partnerId, organizationId }, select: { id: true } }) : true,
    projectId != null ? client.project.findFirst({ where: { id: projectId, organizationId }, select: { id: true } }) : true,
    offerId != null ? client.offer.findFirst({ where: { id: offerId, organizationId }, select: { id: true } }) : true,
    incomingInvoiceId != null ? client.incomingInvoice.findFirst({ where: { id: incomingInvoiceId, organizationId }, select: { id: true } }) : true,
  ]);
  if (!partner) throw new DocumentServiceError("A megadott partner nem található.", 404);
  if (!project) throw new DocumentServiceError("A megadott projekt nem található.", 404);
  if (!offer) throw new DocumentServiceError("A megadott ajánlat nem található.", 404);
  if (!incomingInvoice) throw new DocumentServiceError("A megadott számla nem található.", 404);
}

/**
 * Retrieves documents with optional filtering (search, category, entityType, entityId).
 */
export async function getDocuments(
  {
    organizationId,
    membership,
    query = "",
    documentType,
    entityType,
    entityId,
    sortDirection = "desc",
  },
  client = prisma,
) {
  const access = await checkEntityAccess(
    organizationId,
    membership,
    client,
  );

  // If filtered by specific entity, enforce module & permission access
  if (entityType === "PARTNER" && !access.canViewPartners) {
    return [];
  }
  if (entityType === "PROJECT" && !access.canViewProjects) {
    return [];
  }
  if (entityType === "OFFER" && !access.canViewOffers) return [];
  if (entityType === "INCOMING_INVOICE" && !access.canViewIncomingInvoices) return [];

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
    ...(documentType ? { documentType } : {}),
    ...(entityType && entityId
      ? {
          links: {
            some: {
              organizationId,
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
    access,
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
  const access = await checkEntityAccess(
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
    access,
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
  documentType = "GENERAL",
  description = null,
  partnerId = null,
  projectId = null,
  offerId = null,
  incomingInvoiceId = null,
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
      await validateLinkedEntities({ organizationId, membership, partnerId, projectId, offerId, incomingInvoiceId }, tx);

      const doc = await tx.document.create({
        data: {
          organizationId,
          name: name.trim(),
          originalFileName: file.originalname,
          mimeType: file.mimetype,
          size: savedFile.size,
          storageKey: savedFile.storageKey,
          documentType,
          description: description && description.trim() ? description.trim() : null,
          uploadedByMemberId: actorMemberId || null,
        },
      });

      if (partnerId) {
        await tx.documentLink.create({
          data: {
            documentId: doc.id,
            organizationId,
            entityType: "PARTNER",
            entityId: partnerId,
          },
        });
      }

      if (projectId) {
        await tx.documentLink.create({
          data: {
            documentId: doc.id,
            organizationId,
            entityType: "PROJECT",
            entityId: projectId,
          },
        });
      }

      for (const [entityType, entityId] of [["OFFER", offerId], ["INCOMING_INVOICE", incomingInvoiceId]]) {
        if (entityId) await tx.documentLink.create({ data: { organizationId, documentId: doc.id, entityType, entityId } });
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
            documentType: doc.documentType,
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
  const { name, documentType, description, partnerId, projectId } = data;

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
    if (documentType !== undefined) {
      updateData.documentType = documentType;
    }
    if (description !== undefined) {
      updateData.description = description && description.trim() ? description.trim() : null;
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
            organizationId,
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
            organizationId,
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

const linkArgument = (entityType, entityId) => ({
  partnerId: entityType === "PARTNER" ? entityId : null,
  projectId: entityType === "PROJECT" ? entityId : null,
  offerId: entityType === "OFFER" ? entityId : null,
  incomingInvoiceId: entityType === "INCOMING_INVOICE" ? entityId : null,
});

export async function addDocumentLink({ organizationId, membership, actorMemberId, documentId, entityType, entityId }, client = prisma) {
  return client.$transaction(async (tx) => {
    const document = await tx.document.findFirst({ where: { id: documentId, organizationId }, select: { id: true, name: true } });
    if (!document) return null;
    await validateLinkedEntities({ organizationId, membership, ...linkArgument(entityType, entityId) }, tx);
    const existing = await tx.documentLink.findFirst({ where: { organizationId, documentId, entityType, entityId } });
    if (existing) throw new DocumentServiceError("Ez a dokumentumkapcsolat már létezik.", 409, { code: "DOCUMENT_LINK_ALREADY_EXISTS" });
    const link = await tx.documentLink.create({ data: { organizationId, documentId, entityType, entityId } });
    await activityService.createActivity({ organizationId, actorMemberId, entityType: entityType === "INCOMING_INVOICE" ? "INCOMING_INVOICE" : "DOCUMENT", entityId: entityType === "INCOMING_INVOICE" ? entityId : documentId, action: "DOCUMENT_ATTACHED", title: "Dokumentum kapcsolva", description: document.name, metadata: { documentId, linkedEntityType: entityType, linkedEntityId: entityId } }, tx);
    return link;
  });
}

export async function removeDocumentLink({ organizationId, actorMemberId, documentId, linkId }, client = prisma) {
  return client.$transaction(async (tx) => {
    const link = await tx.documentLink.findFirst({ where: { id: linkId, documentId, organizationId }, include: { document: { select: { name: true } } } });
    if (!link) return false;
    await tx.documentLink.delete({ where: { id: link.id } });
    await activityService.createActivity({ organizationId, actorMemberId, entityType: link.entityType === "INCOMING_INVOICE" ? "INCOMING_INVOICE" : "DOCUMENT", entityId: link.entityType === "INCOMING_INVOICE" ? link.entityId : documentId, action: "DOCUMENT_REMOVED", title: "Dokumentumkapcsolat eltávolítva", description: link.document.name, metadata: { documentId, linkedEntityType: link.entityType, linkedEntityId: link.entityId } }, tx);
    return true;
  });
}

export default {
  getDocuments,
  getDocumentById,
  getDocumentForDownload,
  createDocument,
  updateDocument,
  deleteDocument,
  addDocumentLink,
  removeDocumentLink,
};
