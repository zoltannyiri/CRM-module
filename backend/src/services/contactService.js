import prisma from "../lib/prisma.js";
import activityService from "./activityService.js";

async function getContacts({ organizationId, partnerId }) {
  return prisma.contact.findMany({
    where: {
      ...(partnerId ? { partnerId } : {}),
      partner: {
        organizationId,
      },
    },
    include: {
      partner: {
        select: {
          id: true,
          name: true,
          type: true,
        },
      },
    },
    orderBy: [
      { lastName: "asc" },
      { firstName: "asc" },
    ],
  });
}

async function getContactsForExport({ organizationId, query = "", type = "ALL", sortDirection = "desc" }) {
  const contacts = await prisma.contact.findMany({
    where: {
      partner: {
        organizationId,
        ...(type === "COMPANY" || type === "PERSON" ? { type } : {}),
      },
    },
    include: { partner: { select: { id: true, name: true, type: true } } },
    orderBy: { id: sortDirection === "asc" ? "asc" : "desc" },
  });
  const normalizedQuery = query.trim().toLocaleLowerCase("hu");
  if (!normalizedQuery) return contacts;

  return contacts.filter((contact) => {
    const fullName = `${contact.firstName} ${contact.lastName}`;
    return [fullName, contact.partner.name, contact.position, contact.email, contact.phone]
      .some((value) => value?.toLocaleLowerCase("hu").includes(normalizedQuery));
  });
}

async function getContactById({ organizationId, contactId }) {
  return prisma.contact.findFirst({
    where: { id: contactId, partner: { organizationId } },
    include: { partner: { select: { id: true, name: true, type: true } } },
  });
}

async function createContact({ organizationId, actorMemberId, partnerId, data }) {
  return prisma.$transaction(async (tx) => {
    const partner = await tx.partner.findFirst({
      where: { id: partnerId, organizationId },
      select: { id: true, name: true },
    });
    if (!partner) return null;

    const contact = await tx.contact.create({
      data: { ...data, partnerId: partner.id },
      include: { partner: { select: { id: true, name: true, type: true } } },
    });

    const fullName = `${contact.firstName} ${contact.lastName}`.trim();
    await activityService.createActivity(
      {
        organizationId,
        actorMemberId,
        entityType: "CONTACT",
        entityId: contact.id,
        action: "CREATED",
        title: "Kapcsolattartó létrehozva",
        description: fullName,
        metadata: { partnerId: partner.id, partnerName: partner.name, position: contact.position },
      },
      tx,
    );

    return contact;
  });
}

async function updateContact({ organizationId, actorMemberId, contactId, partnerId, data }) {
  return prisma.$transaction(async (tx) => {
    const [contact, partner] = await Promise.all([
      tx.contact.findFirst({
        where: { id: contactId, partner: { organizationId } },
      }),
      tx.partner.findFirst({
        where: { id: partnerId, organizationId },
        select: { id: true },
      }),
    ]);
    if (!contact || !partner) return null;

    const candidateFields = ["firstName", "lastName", "email", "phone", "position", "note"];
    const changedFields = candidateFields.filter((field) => {
      if (!Object.hasOwn(data, field)) return false;
      const oldVal = contact[field] ?? null;
      const newVal = data[field] ?? null;
      return oldVal !== newVal;
    });

    if (contact.partnerId !== partner.id) {
      changedFields.push("partnerId");
    }

    const updated = await tx.contact.update({
      where: { id: contact.id },
      data: { ...data, partnerId: partner.id },
      include: { partner: { select: { id: true, name: true, type: true } } },
    });

    if (changedFields.length > 0) {
      const fullName = `${updated.firstName} ${updated.lastName}`.trim();
      await activityService.createActivity(
        {
          organizationId,
          actorMemberId,
          entityType: "CONTACT",
          entityId: updated.id,
          action: "UPDATED",
          title: "Kapcsolattartó módosítva",
          description: fullName,
          metadata: { changedFields },
        },
        tx,
      );
    }

    return updated;
  });
}

async function deleteContact({ organizationId, actorMemberId, contactId }) {
  return prisma.$transaction(async (tx) => {
    const contact = await tx.contact.findFirst({
      where: { id: contactId, partner: { organizationId } },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!contact) return false;

    const fullName = `${contact.firstName} ${contact.lastName}`.trim();
    await activityService.createActivity(
      {
        organizationId,
        actorMemberId,
        entityType: "CONTACT",
        entityId: contactId,
        action: "DELETED",
        title: "Kapcsolattartó törölve",
        description: fullName,
      },
      tx,
    );

    const deleted = await tx.contact.deleteMany({
      where: { id: contactId, partner: { organizationId } },
    });
    return deleted.count === 1;
  });
}

export default { getContacts, getContactsForExport, getContactById, createContact, updateContact, deleteContact };
