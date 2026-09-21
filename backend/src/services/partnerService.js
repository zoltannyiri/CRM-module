import prisma from "../lib/prisma.js";
import activityService from "./activityService.js";
import customFieldService from "./customFieldService.js";
import { buildCoreFilterPrismaWhere, resolveCustomFieldMatchingEntityIds } from "./filterService.js";

async function getPartners({ organizationId, customFieldIds = [], filters = [] }, client = prisma) {
  const coreFilters = filters.filter((f) => f.field?.type === "CORE");
  const customFieldFilters = filters.filter((f) => f.field?.type === "CUSTOM_FIELD");

  const coreWhere = buildCoreFilterPrismaWhere(coreFilters);
  const customFieldMatching = await resolveCustomFieldMatchingEntityIds(
    { organizationId, entityType: "PARTNER", customFieldFilters },
    client
  );

  const where = {
    organizationId,
    ...(coreWhere.length > 0 ? { AND: coreWhere } : {}),
    ...(customFieldMatching !== null
      ? (customFieldMatching.in !== undefined
          ? { id: { in: customFieldMatching.in } }
          : { id: { notIn: customFieldMatching.notIn } })
      : {}),
  };

  const partners = await client.partner.findMany({
    where,
    include: {
      contacts: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
  if (!customFieldIds.length || !partners.length) return partners;
  const values = await customFieldService.getBulkCustomFieldValues({ organizationId, entityType: "PARTNER", entityIds: partners.map(({ id }) => id), customFieldIds }, client);
  return partners.map((partner) => ({ ...partner, customFieldValues: values.get(partner.id) || {} }));
}

async function getPartnersForExport({ organizationId, query = "", type = "ALL", sortDirection = "desc" }) {
  const partners = await prisma.partner.findMany({
    where: {
      organizationId,
      ...(type === "COMPANY" || type === "PERSON" ? { type } : {}),
    },
    include: { contacts: true },
    orderBy: { id: sortDirection === "asc" ? "asc" : "desc" },
  });

  const normalizedQuery = query.trim().toLocaleLowerCase("hu");
  if (!normalizedQuery) return partners;

  return partners.filter((partner) => {
    const contactName = partner.contacts[0]
      ? `${partner.contacts[0].firstName} ${partner.contacts[0].lastName}`
      : "";
    return [partner.name, partner.email, partner.phone, partner.website, contactName]
      .some((value) => value?.toLocaleLowerCase("hu").includes(normalizedQuery));
  });
}

async function getPartnerById({ partnerId, organizationId }) {
  return prisma.partner.findFirst({
    where: {
      id: partnerId,
      organizationId,
    },
    include: {
      contacts: true,
    },
  });
}

export async function createPartnerInTransaction({ organizationId, actorMemberId, data, customFieldValues }, tx) {
    const partner = await tx.partner.create({
      data: {
        organizationId,
        ...data,
      },
      include: {
        contacts: true,
      },
    });

    await activityService.createActivity(
      {
        organizationId,
        actorMemberId,
        entityType: "PARTNER",
        entityId: partner.id,
        action: "CREATED",
        title: "Partner létrehozva",
        description: partner.name,
        metadata: { type: partner.type, name: partner.name },
      },
      tx,
    );

    if (customFieldValues !== undefined && customFieldValues !== null) {
      await customFieldService.setCustomFieldValues({
        organizationId,
        entityType: "PARTNER",
        entityId: partner.id,
        values: customFieldValues,
      }, tx);
    }

    return partner;
}

async function createPartner({ organizationId, actorMemberId, data, customFieldValues }) {
  return prisma.$transaction((tx) => createPartnerInTransaction({ organizationId, actorMemberId, data, customFieldValues }, tx));
}

async function updatePartner({ organizationId, actorMemberId, partnerId, data, customFieldValues }) {
  const fields = ["name", "email", "phone", "type", "address", "website", "taxNumber", "note"];
  const changes = Object.fromEntries(
    fields.filter((field) => Object.hasOwn(data, field)).map((field) => [field, data[field]]),
  );

  return prisma.$transaction(async (tx) => {
    const existing = await tx.partner.findFirst({
      where: { id: partnerId, organizationId },
    });
    if (!existing) return null;

    const changedFields = Object.keys(changes).filter((field) => {
      const oldVal = existing[field] ?? null;
      const newVal = changes[field] ?? null;
      return oldVal !== newVal;
    });

    let updated = existing;
    if (changedFields.length > 0) {
      updated = await tx.partner.update({
        where: { id: partnerId, organizationId },
        data: changes,
        include: { contacts: true },
      });

      await activityService.createActivity(
        {
          organizationId,
          actorMemberId,
          entityType: "PARTNER",
          entityId: updated.id,
          action: "UPDATED",
          title: "Partner módosítva",
          description: updated.name,
          metadata: { changedFields },
        },
        tx,
      );
    }

    if (customFieldValues !== undefined && customFieldValues !== null) {
      await customFieldService.setCustomFieldValues({
        organizationId,
        entityType: "PARTNER",
        entityId: updated.id,
        values: customFieldValues,
      }, tx);
    }

    return updated;
  });
}

async function deletePartner({ organizationId, actorMemberId, partnerId }) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.partner.findFirst({
      where: { id: partnerId, organizationId },
      select: { id: true, name: true },
    });
    if (!existing) return null;

    const linkedOfferCount = await tx.offer.count({ where: { organizationId, partnerId } });
    if (linkedOfferCount > 0) {
      const error = new Error("A partner nem törölhető, amíg ajánlat tartozik hozzá.");
      error.statusCode = 409;
      throw error;
    }

    await tx.customFieldValue.deleteMany({
      where: { organizationId, entityType: "PARTNER", entityId: partnerId },
    });

    await activityService.createActivity(
      {
        organizationId,
        actorMemberId,
        entityType: "PARTNER",
        entityId: partnerId,
        action: "DELETED",
        title: "Partner törölve",
        description: existing.name,
        metadata: { name: existing.name },
      },
      tx,
    );

    await tx.documentLink.deleteMany({
      where: { entityType: "PARTNER", entityId: partnerId },
    });

    return tx.partner.delete({
      where: { id: partnerId, organizationId },
    });
  });
}

export default {
  getPartners,
  getPartnersForExport,
  getPartnerById,
  createPartner,
  updatePartner,
  deletePartner,
};
