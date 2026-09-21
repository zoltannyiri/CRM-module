import { Prisma } from "@prisma/client";

import prisma from "../lib/prisma.js";
import activityService from "./activityService.js";
import { getEnabledModules } from "./organizationModuleService.js";
import { getEffectivePermissions } from "./permissionService.js";
import { INCOMING_INVOICE_TRANSITIONS } from "../validation/incomingInvoiceValidation.js";

export class IncomingInvoiceError extends Error {
  constructor(message, statusCode = 400, details = {}) {
    super(message);
    this.statusCode = statusCode;
    Object.assign(this, details);
  }
}

const invoiceSelect = {
  id: true, supplierPartnerId: true, projectId: true, invoiceNumber: true, issueDate: true,
  performanceDate: true, dueDate: true, currency: true, netAmount: true, vatAmount: true,
  grossAmount: true, status: true, note: true, createdAt: true, updatedAt: true,
  createdByMember: { select: { id: true, user: { select: { firstName: true, lastName: true, email: true } } } },
};

async function relationAccess(organizationId, membership, client) {
  const [modules, permissions] = await Promise.all([
    getEnabledModules(organizationId, client), getEffectivePermissions(membership, client),
  ]);
  const enabled = new Set(modules);
  const allowed = new Set(permissions);
  return {
    partners: enabled.has("PARTNERS") && allowed.has("PARTNERS_VIEW"),
    projects: enabled.has("PROJECTS") && allowed.has("PROJECTS_VIEW"),
    documents: enabled.has("DOCUMENTS") && allowed.has("DOCUMENTS_VIEW"),
  };
}

async function validateRelations({ organizationId, membership, supplierPartnerId, projectId, supplierProvided, projectProvided }, client) {
  const access = await relationAccess(organizationId, membership, client);
  if (supplierProvided && !access.partners) throw new IncomingInvoiceError("Nincs jogosultsága szállító kiválasztásához.", 403, { code: "PERMISSION_DENIED", permission: "PARTNERS_VIEW" });
  if (projectProvided && projectId !== null && !access.projects) throw new IncomingInvoiceError("Nincs jogosultsága projekt kiválasztásához.", 403, { code: "PERMISSION_DENIED", permission: "PROJECTS_VIEW" });
  const [partner, project] = await Promise.all([
    supplierProvided ? client.partner.findFirst({ where: { id: supplierPartnerId, organizationId }, select: { id: true } }) : true,
    projectProvided && projectId !== null ? client.project.findFirst({ where: { id: projectId, organizationId }, select: { id: true } }) : true,
  ]);
  if (!partner) throw new IncomingInvoiceError("A szállító partner nem található.", 404);
  if (!project) throw new IncomingInvoiceError("A projekt nem található.", 404);
  return access;
}

function serialize(record, relations) {
  return {
    ...record,
    netAmount: record.netAmount.toString(),
    vatAmount: record.vatAmount.toString(),
    grossAmount: record.grossAmount.toString(),
    supplier: relations.supplier || null,
    project: relations.project || null,
    documents: relations.documents || [],
  };
}

async function enrich(records, organizationId, access, client, { includeDocuments = false } = {}) {
  if (!records.length) return [];
  const partnerIds = access.partners ? [...new Set(records.map(({ supplierPartnerId }) => supplierPartnerId))] : [];
  const projectIds = access.projects ? [...new Set(records.map(({ projectId }) => projectId).filter(Boolean))] : [];
  const invoiceIds = records.map(({ id }) => id);
  const [partners, projects, documents] = await Promise.all([
    partnerIds.length ? client.partner.findMany({ where: { organizationId, id: { in: partnerIds } }, select: { id: true, name: true } }) : [],
    projectIds.length ? client.project.findMany({ where: { organizationId, id: { in: projectIds } }, select: { id: true, name: true } }) : [],
    includeDocuments && access.documents ? client.document.findMany({
      where: { organizationId, links: { some: { organizationId, entityType: "INCOMING_INVOICE", entityId: { in: invoiceIds } } } },
      select: { id: true, name: true, originalFileName: true, mimeType: true, size: true, documentType: true, createdAt: true, links: { where: { organizationId, entityType: "INCOMING_INVOICE", entityId: { in: invoiceIds } }, select: { entityId: true } } },
      orderBy: { createdAt: "desc" },
    }) : [],
  ]);
  const partnerMap = new Map(partners.map((value) => [value.id, value]));
  const projectMap = new Map(projects.map((value) => [value.id, value]));
  const docsByInvoice = new Map();
  for (const document of documents) for (const link of document.links) {
    const { links: _links, ...safe } = document;
    docsByInvoice.set(link.entityId, [...(docsByInvoice.get(link.entityId) || []), safe]);
  }
  return records.map((record) => serialize(record, {
    supplier: partnerMap.get(record.supplierPartnerId),
    project: record.projectId ? projectMap.get(record.projectId) : null,
    documents: docsByInvoice.get(record.id),
  }));
}

export async function getIncomingInvoices({ organizationId, membership, filters = {} }, client = prisma) {
  const access = await relationAccess(organizationId, membership, client);
  if (filters.supplierPartnerId && !access.partners) return [];
  if (filters.projectId && !access.projects) return [];
  const dateRange = (from, to) => ({ ...(from && { gte: from }), ...(to && { lte: to }) });
  const orderFields = new Set(["createdAt", "issueDate", "dueDate", "grossAmount"]);
  const sortBy = orderFields.has(filters.sortBy) ? filters.sortBy : "createdAt";
  const records = await client.incomingInvoice.findMany({
    where: {
      organizationId,
      ...(filters.supplierPartnerId && { supplierPartnerId: filters.supplierPartnerId }),
      ...(filters.projectId && { projectId: filters.projectId }),
      ...(filters.status && { status: filters.status }),
      ...(filters.currency && { currency: filters.currency }),
      ...((filters.dueFrom || filters.dueTo) && { dueDate: dateRange(filters.dueFrom, filters.dueTo) }),
      ...((filters.issueFrom || filters.issueTo) && { issueDate: dateRange(filters.issueFrom, filters.issueTo) }),
      ...(filters.query?.trim() && { OR: [
        { invoiceNumber: { contains: filters.query.trim(), mode: "insensitive" } },
        ...(access.partners ? [{ supplierPartner: { name: { contains: filters.query.trim(), mode: "insensitive" } } }] : []),
      ] }),
    },
    select: invoiceSelect,
    orderBy: [{ [sortBy]: filters.sortDirection === "asc" ? "asc" : "desc" }, { id: "desc" }],
  });
  return enrich(records, organizationId, access, client);
}

export async function getIncomingInvoiceById({ organizationId, membership, invoiceId }, client = prisma) {
  const [access, record] = await Promise.all([
    relationAccess(organizationId, membership, client),
    client.incomingInvoice.findFirst({ where: { id: invoiceId, organizationId }, select: invoiceSelect }),
  ]);
  if (!record) return null;
  return (await enrich([record], organizationId, access, client, { includeDocuments: true }))[0];
}

export async function createIncomingInvoice({ organizationId, membership, actorMemberId, data }, client = prisma) {
  return client.$transaction(async (tx) => {
    const access = await validateRelations({ organizationId, membership, supplierPartnerId: data.supplierPartnerId, projectId: data.projectId, supplierProvided: true, projectProvided: data.projectId !== null }, tx);
    try {
      const created = await tx.incomingInvoice.create({ data: { ...data, organizationId, createdByMemberId: actorMemberId || null }, select: invoiceSelect });
      await activityService.createActivity({ organizationId, actorMemberId, entityType: "INCOMING_INVOICE", entityId: created.id, action: "CREATED", title: "Bejövő számla létrehozva", description: created.invoiceNumber, metadata: { status: created.status } }, tx);
      return (await enrich([created], organizationId, access, tx))[0];
    } catch (error) {
      if ((error instanceof Prisma.PrismaClientKnownRequestError || error?.code === "P2002") && error.code === "P2002") throw new IncomingInvoiceError("Ezzel a szállítóval és számlaszámmal már létezik bizonylat.", 409, { code: "INVOICE_ALREADY_EXISTS" });
      throw error;
    }
  });
}

export async function updateIncomingInvoice({ organizationId, membership, actorMemberId, invoiceId, data }, client = prisma) {
  return client.$transaction(async (tx) => {
    const existing = await tx.incomingInvoice.findFirst({ where: { id: invoiceId, organizationId }, select: invoiceSelect });
    if (!existing) return null;
    if (data.status !== undefined && data.status !== existing.status && !INCOMING_INVOICE_TRANSITIONS[existing.status].includes(data.status)) {
      throw new IncomingInvoiceError(`A ${existing.status} → ${data.status} státuszváltás nem engedélyezett.`);
    }
    const nextNet = data.netAmount ?? existing.netAmount;
    const nextVat = data.vatAmount ?? existing.vatAmount;
    const nextGross = data.grossAmount ?? existing.grossAmount;
    if (!nextNet.add(nextVat).equals(nextGross)) throw new IncomingInvoiceError("A nettó és ÁFA összegének meg kell egyeznie a bruttó összeggel.");
    const access = await validateRelations({ organizationId, membership, supplierPartnerId: data.supplierPartnerId, projectId: data.projectId, supplierProvided: data.supplierPartnerId !== undefined, projectProvided: data.projectId !== undefined }, tx);
    try {
      const updated = await tx.incomingInvoice.update({ where: { id: invoiceId, organizationId }, data, select: invoiceSelect });
      if (data.status !== undefined && data.status !== existing.status) await activityService.createActivity({ organizationId, actorMemberId, entityType: "INCOMING_INVOICE", entityId: invoiceId, action: "STATUS_CHANGED", title: "Számlastátusz megváltozott", description: existing.invoiceNumber, metadata: { oldValue: existing.status, newValue: data.status } }, tx);
      const fields = Object.keys(data).filter((field) => field !== "status");
      if (fields.length) await activityService.createActivity({ organizationId, actorMemberId, entityType: "INCOMING_INVOICE", entityId: invoiceId, action: "UPDATED", title: "Bejövő számla módosítva", description: existing.invoiceNumber, metadata: { changedFields: fields } }, tx);
      return (await enrich([updated], organizationId, access, tx, { includeDocuments: true }))[0];
    } catch (error) {
      if ((error instanceof Prisma.PrismaClientKnownRequestError || error?.code === "P2002") && error.code === "P2002") throw new IncomingInvoiceError("Ezzel a szállítóval és számlaszámmal már létezik bizonylat.", 409, { code: "INVOICE_ALREADY_EXISTS" });
      throw error;
    }
  });
}

export async function deleteIncomingInvoice({ organizationId, actorMemberId, invoiceId }, client = prisma) {
  return client.$transaction(async (tx) => {
    const existing = await tx.incomingInvoice.findFirst({ where: { id: invoiceId, organizationId }, select: { id: true, invoiceNumber: true } });
    if (!existing) return false;
    await tx.documentLink.deleteMany({ where: { organizationId, entityType: "INCOMING_INVOICE", entityId: invoiceId } });
    await activityService.createActivity({ organizationId, actorMemberId, entityType: "INCOMING_INVOICE", entityId: invoiceId, action: "DELETED", title: "Bejövő számla törölve", description: existing.invoiceNumber }, tx);
    return (await tx.incomingInvoice.deleteMany({ where: { id: invoiceId, organizationId } })).count === 1;
  });
}

export default { getIncomingInvoices, getIncomingInvoiceById, createIncomingInvoice, updateIncomingInvoice, deleteIncomingInvoice };
