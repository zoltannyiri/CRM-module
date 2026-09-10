import { Prisma } from "@prisma/client";

import prisma from "../lib/prisma.js";
import activityService from "./activityService.js";
import { getEnabledModules } from "./organizationModuleService.js";
import { getEffectivePermissions } from "./permissionService.js";

const createdBySelect = {
  user: { select: { firstName: true, lastName: true } },
};

const itemSelect = {
  name: true,
  description: true,
  quantity: true,
  unit: true,
  unitPrice: true,
  vatRate: true,
  position: true,
};

export class OfferInputError extends Error {
  constructor(message, statusCode = 400, details = {}) {
    super(message);
    this.statusCode = statusCode;
    Object.assign(this, details);
  }
}

function decimal(value, field) {
  try {
    const result = new Prisma.Decimal(value);
    if (!result.isFinite()) throw new Error();
    return result;
  } catch {
    throw new OfferInputError(`A(z) ${field} mező érvénytelen szám.`);
  }
}

export function normalizeOfferItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new OfferInputError("Legalább egy ajánlati tétel megadása kötelező.");
  }
  return items.map((item, index) => {
    const name = typeof item?.name === "string" ? item.name.trim() : "";
    const unit = typeof item?.unit === "string" ? item.unit.trim() : "";
    if (!name) throw new OfferInputError(`A(z) ${index + 1}. tétel megnevezése kötelező.`);
    if (!unit || unit.length > 32) throw new OfferInputError(`A(z) ${index + 1}. tétel egysége kötelező és legfeljebb 32 karakter lehet.`);
    if ([item.quantity, item.unitPrice, item.vatRate].some((value) => value === null || value === undefined || value === "")) {
      throw new OfferInputError(`A(z) ${index + 1}. tétel számmezőinek kitöltése kötelező.`);
    }
    const quantity = decimal(item.quantity, `${index + 1}. tétel mennyisége`);
    const unitPrice = decimal(item.unitPrice, `${index + 1}. tétel egységára`);
    const vatRate = decimal(item.vatRate, `${index + 1}. tétel ÁFA kulcsa`);
    if (quantity.lte(0)) throw new OfferInputError("A mennyiségnek nullánál nagyobbnak kell lennie.");
    if (unitPrice.lt(0)) throw new OfferInputError("A nettó egységár nem lehet negatív.");
    if (vatRate.lt(0) || vatRate.gt(100)) throw new OfferInputError("Az ÁFA kulcs 0 és 100 közötti lehet.");
    if (quantity.decimalPlaces() > 4 || quantity.abs().gte("100000000000000")) throw new OfferInputError("A mennyiség legfeljebb 4 tizedesjegyet tartalmazhat.");
    if (unitPrice.decimalPlaces() > 2 || unitPrice.abs().gte("10000000000000000")) throw new OfferInputError("A nettó egységár legfeljebb 2 tizedesjegyet tartalmazhat.");
    if (vatRate.decimalPlaces() > 2) throw new OfferInputError("Az ÁFA kulcs legfeljebb 2 tizedesjegyet tartalmazhat.");
    return {
      name,
      description: typeof item.description === "string" && item.description.trim() ? item.description.trim() : null,
      quantity,
      unit,
      unitPrice,
      vatRate,
      position: index + 1,
    };
  });
}

export function calculateOfferTotals(items) {
  let netTotal = new Prisma.Decimal(0);
  let vatTotal = new Prisma.Decimal(0);
  const calculatedItems = items.map((item) => {
    const quantity = decimal(item.quantity, "mennyiség");
    const unitPrice = decimal(item.unitPrice, "egységár");
    const vatRate = decimal(item.vatRate, "ÁFA kulcs");
    const netAmount = quantity.mul(unitPrice).toDecimalPlaces(2);
    const vatAmount = netAmount.mul(vatRate).div(100).toDecimalPlaces(2);
    const grossAmount = netAmount.add(vatAmount).toDecimalPlaces(2);
    netTotal = netTotal.add(netAmount);
    vatTotal = vatTotal.add(vatAmount);
    return {
      ...item,
      quantity: quantity.toFixed(4),
      unitPrice: unitPrice.toFixed(2),
      vatRate: vatRate.toFixed(2),
      netAmount: netAmount.toFixed(2),
      vatAmount: vatAmount.toFixed(2),
      grossAmount: grossAmount.toFixed(2),
    };
  });
  return {
    items: calculatedItems,
    totals: {
      net: netTotal.toDecimalPlaces(2).toFixed(2),
      vat: vatTotal.toDecimalPlaces(2).toFixed(2),
      gross: netTotal.add(vatTotal).toDecimalPlaces(2).toFixed(2),
    },
  };
}

async function getRelationAccess(organizationId, membership, client) {
  const [enabledModules, effectivePermissions] = await Promise.all([
    getEnabledModules(organizationId, client),
    getEffectivePermissions(membership, client),
  ]);
  const modules = new Set(enabledModules);
  const permissions = new Set(effectivePermissions);
  return {
    canViewPartners: modules.has("PARTNERS") && permissions.has("PARTNERS_VIEW"),
    canViewProjects: modules.has("PROJECTS") && permissions.has("PROJECTS_VIEW"),
  };
}

async function validateRelations({ organizationId, membership, partnerId, projectId, partnerProvided, projectProvided }, client) {
  const access = await getRelationAccess(organizationId, membership, client);
  if (partnerProvided && !access.canViewPartners) {
    throw new OfferInputError("Nincs jogosultsága partner kiválasztásához.", 403, { code: "PERMISSION_DENIED", permission: "PARTNERS_VIEW" });
  }
  if (projectProvided && !access.canViewProjects) {
    throw new OfferInputError("Nincs jogosultsága projekt kiválasztásához.", 403, { code: "PERMISSION_DENIED", permission: "PROJECTS_VIEW" });
  }
  const [partner, project] = await Promise.all([
    partnerProvided ? client.partner.findFirst({ where: { id: partnerId, organizationId }, select: { id: true } }) : true,
    projectProvided && projectId !== null ? client.project.findFirst({ where: { id: projectId, organizationId }, select: { id: true } }) : true,
  ]);
  if (!partner) throw new OfferInputError("A partner nem található.", 404);
  if (!project) throw new OfferInputError("A projekt nem található.", 404);
  return access;
}

function baseSelect() {
  return {
    id: true,
    organizationId: true,
    offerNumber: true,
    partnerId: true,
    projectId: true,
    status: true,
    issueDate: true,
    validUntil: true,
    currency: true,
    note: true,
    createdAt: true,
    updatedAt: true,
    createdByMember: { select: createdBySelect },
    items: { select: itemSelect, orderBy: { position: "asc" } },
  };
}

function listSelect() {
  return {
    id: true,
    organizationId: true,
    offerNumber: true,
    partnerId: true,
    projectId: true,
    status: true,
    issueDate: true,
    validUntil: true,
    currency: true,
    items: { select: { quantity: true, unitPrice: true, vatRate: true } },
  };
}

async function serializeOffers(records, organizationId, access, client, { includeItems = false } = {}) {
  const partnerIds = access.canViewPartners ? [...new Set(records.map(({ partnerId }) => partnerId))] : [];
  const projectIds = access.canViewProjects ? [...new Set(records.map(({ projectId }) => projectId).filter(Boolean))] : [];
  const [partners, projects] = await Promise.all([
    partnerIds.length ? client.partner.findMany({ where: { organizationId, id: { in: partnerIds } }, select: { id: true, name: true } }) : [],
    projectIds.length ? client.project.findMany({ where: { organizationId, id: { in: projectIds } }, select: { id: true, name: true } }) : [],
  ]);
  const partnerMap = new Map(partners.map((entity) => [entity.id, entity]));
  const projectMap = new Map(projects.map((entity) => [entity.id, entity]));
  return records.map((record) => {
    const { organizationId: _organizationId, partnerId, projectId, items, ...offer } = record;
    const calculated = calculateOfferTotals(items);
    return {
      ...offer,
      partner: access.canViewPartners ? partnerMap.get(partnerId) || null : null,
      project: access.canViewProjects && projectId ? projectMap.get(projectId) || null : null,
      itemCount: items.length,
      ...(includeItems && { items: calculated.items }),
      totals: calculated.totals,
    };
  });
}

export async function getOffers({ organizationId, membership, query = "", status, partnerId, projectId, sortDirection = "desc" }, client = prisma) {
  const access = await getRelationAccess(organizationId, membership, client);
  if (partnerId && !access.canViewPartners) return [];
  if (projectId && !access.canViewProjects) return [];
  const records = await client.offer.findMany({
    where: {
      organizationId,
      ...(status ? { status } : {}),
      ...(partnerId ? { partnerId } : {}),
      ...(projectId ? { projectId } : {}),
      ...(query.trim() ? { offerNumber: { contains: query.trim(), mode: "insensitive" } } : {}),
    },
    select: listSelect(),
    orderBy: { id: sortDirection === "asc" ? "asc" : "desc" },
  });
  return serializeOffers(records, organizationId, access, client);
}

export async function getOfferById({ organizationId, membership, offerId }, client = prisma) {
  const [access, record] = await Promise.all([
    getRelationAccess(organizationId, membership, client),
    client.offer.findFirst({ where: { id: offerId, organizationId }, select: baseSelect() }),
  ]);
  if (!record) return null;
  const [offer] = await serializeOffers([record], organizationId, access, client, { includeItems: true });
  return offer;
}

async function nextOfferNumber(organizationId, issueDate, client) {
  const year = issueDate.getUTCFullYear();
  const sequence = await client.offerSequence.upsert({
    where: { organizationId_year: { organizationId, year } },
    create: { organizationId, year, lastNumber: 1 },
    update: { lastNumber: { increment: 1 } },
    select: { lastNumber: true },
  });
  return `AJ-${year}-${String(sequence.lastNumber).padStart(4, "0")}`;
}

export async function createOffer({ organizationId, membership, actorMemberId, data }, client = prisma) {
  const items = normalizeOfferItems(data.items);
  if (data.validUntil < data.issueDate) throw new OfferInputError("Az érvényesség vége nem lehet korábbi a kiállítás dátumánál.");
  return client.$transaction(async (tx) => {
    const access = await validateRelations({ organizationId, membership, partnerId: data.partnerId, projectId: data.projectId, partnerProvided: true, projectProvided: data.projectId !== null }, tx);
    const offerNumber = await nextOfferNumber(organizationId, data.issueDate, tx);
    const created = await tx.offer.create({
      data: {
        organizationId,
        offerNumber,
        partnerId: data.partnerId,
        projectId: data.projectId,
        status: data.status,
        issueDate: data.issueDate,
        validUntil: data.validUntil,
        currency: data.currency,
        note: data.note,
        createdByMemberId: actorMemberId || null,
        items: { create: items },
      },
      select: baseSelect(),
    });
    await activityService.createActivity({ organizationId, actorMemberId, entityType: "OFFER", entityId: created.id, action: "CREATED", title: "Ajánlat létrehozva", description: created.offerNumber, metadata: { status: created.status } }, tx);
    const [result] = await serializeOffers([created], organizationId, access, tx, { includeItems: true });
    return result;
  });
}

export async function updateOffer({ organizationId, membership, actorMemberId, offerId, data }, client = prisma) {
  const normalizedItems = data.items !== undefined ? normalizeOfferItems(data.items) : undefined;
  return client.$transaction(async (tx) => {
    const existing = await tx.offer.findFirst({ where: { id: offerId, organizationId }, select: baseSelect() });
    if (!existing) return null;
    const issueDate = data.issueDate ?? existing.issueDate;
    const validUntil = data.validUntil ?? existing.validUntil;
    if (validUntil < issueDate) throw new OfferInputError("Az érvényesség vége nem lehet korábbi a kiállítás dátumánál.");
    const access = await validateRelations({ organizationId, membership, partnerId: data.partnerId, projectId: data.projectId, partnerProvided: data.partnerId !== undefined, projectProvided: data.projectId !== undefined }, tx);
    const statusChanged = data.status !== undefined && data.status !== existing.status;
    const updateData = { ...data };
    delete updateData.items;
    if (normalizedItems) {
      updateData.items = { deleteMany: {}, create: normalizedItems };
    }
    const updated = await tx.offer.update({ where: { id: offerId, organizationId }, data: updateData, select: baseSelect() });
    if (statusChanged) {
      await activityService.createActivity({ organizationId, actorMemberId, entityType: "OFFER", entityId: offerId, action: "STATUS_CHANGED", title: "Ajánlat státusza megváltozott", description: existing.offerNumber, metadata: { field: "status", oldValue: existing.status, newValue: data.status } }, tx);
    }
    const changedFields = Object.keys(data).filter((field) => field !== "status");
    if (changedFields.length) {
      await activityService.createActivity({ organizationId, actorMemberId, entityType: "OFFER", entityId: offerId, action: "UPDATED", title: "Ajánlat módosítva", description: existing.offerNumber, metadata: { changedFields } }, tx);
    }
    const [result] = await serializeOffers([updated], organizationId, access, tx, { includeItems: true });
    return result;
  });
}

export async function deleteOffer({ organizationId, actorMemberId, offerId }, client = prisma) {
  return client.$transaction(async (tx) => {
    const existing = await tx.offer.findFirst({ where: { id: offerId, organizationId }, select: { id: true, offerNumber: true } });
    if (!existing) return false;
    await activityService.createActivity({ organizationId, actorMemberId, entityType: "OFFER", entityId: offerId, action: "DELETED", title: "Ajánlat törölve", description: existing.offerNumber }, tx);
    const result = await tx.offer.deleteMany({ where: { id: offerId, organizationId } });
    return result.count === 1;
  });
}

export default { getOffers, getOfferById, createOffer, updateOffer, deleteOffer };
