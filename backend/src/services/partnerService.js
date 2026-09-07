import prisma from "../lib/prisma.js";



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
  })
}

async function createPartner({ organizationId, note, address, taxNumber, website, phone, email, name, type }) {
  return prisma.partner.create({
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
}

async function updatePartner({ organizationId, partnerId, data }) {
  // Never accept tenant IDs, primary keys or nested relation writes from the body.
  const fields = ["name", "email", "phone", "type", "address", "website", "taxNumber", "note"];
  const changes = Object.fromEntries(
    fields.filter((field) => Object.hasOwn(data, field)).map((field) => [field, data[field]])
  );

  try {
    return await prisma.partner.update({
      where: { id: partnerId, organizationId },
      data: changes,
      include: { contacts: true },
    });
  } catch (error) {
    if (error.code === "P2025") return null;
    throw error;
  }
}

async function deletePartner({ organizationId, partnerId }) {
  try {
    return await prisma.partner.delete({
      where: { id: partnerId, organizationId },
    });
  } catch (error) {
    if (error.code === "P2025") return null;
    throw error;
  }
}

export default {
  getPartners,
  getPartnersForExport,
  getPartnerById,
  createPartner,
  updatePartner,
  deletePartner,
};
