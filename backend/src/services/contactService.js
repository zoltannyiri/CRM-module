import prisma from "../lib/prisma.js";

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

async function createContact({ organizationId, partnerId, data }) {
  const partner = await prisma.partner.findFirst({
    where: { id: partnerId, organizationId },
    select: { id: true },
  });
  if (!partner) return null;

  return prisma.contact.create({
    data: { ...data, partnerId: partner.id },
    include: { partner: { select: { id: true, name: true, type: true } } },
  });
}

async function updateContact({ organizationId, contactId, partnerId, data }) {
  return prisma.$transaction(async (transaction) => {
    const [contact, partner] = await Promise.all([
      transaction.contact.findFirst({
        where: { id: contactId, partner: { organizationId } },
        select: { id: true },
      }),
      transaction.partner.findFirst({
        where: { id: partnerId, organizationId },
        select: { id: true },
      }),
    ]);
    if (!contact || !partner) return null;

    return transaction.contact.update({
      where: { id: contact.id },
      data: { ...data, partnerId: partner.id },
      include: { partner: { select: { id: true, name: true, type: true } } },
    });
  });
}

async function deleteContact({ organizationId, contactId }) {
  const deleted = await prisma.contact.deleteMany({
    where: { id: contactId, partner: { organizationId } },
  });
  return deleted.count === 1;
}

export default { getContacts, getContactsForExport, getContactById, createContact, updateContact, deleteContact };
