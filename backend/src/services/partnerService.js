import prisma from "../lib/prisma.js";
import activityService from "./activityService.js";

async function getPartners({ organizationId }) {
  const partners = await prisma.partner.findMany({
    where: {
      organizationId,
    },
    include: {
      contacts: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
  return partners;
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

async function createPartner({ organizationId, actorMemberId, note, address, taxNumber, website, phone, email, name, type }) {
  return prisma.$transaction(async (tx) => {
    const partner = await tx.partner.create({
      data: {
        organizationId,
        note,
        address,
        taxNumber,
        website,
        phone,
        email,
        name,
        type,
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

    return partner;
  });
}

async function updatePartner({ organizationId, actorMemberId, partnerId, data }) {
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

    const updated = await tx.partner.update({
      where: { id: partnerId, organizationId },
      data: changes,
      include: { contacts: true },
    });

    if (changedFields.length > 0) {
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
