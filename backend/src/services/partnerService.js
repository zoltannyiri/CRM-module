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
  const partner = await prisma.partner.findFirst({
    where: {
      id: partnerId,
      organizationId,
    },
  });

  if (!partner) {
    throw new Error("Partner not found");
  }

  return prisma.partner.update({
    where: {
      id: partnerId,
    },
    data,
    include: {
      contacts: true,
    }
  })
}

async function deletePartner({ organizationId, partnerId }) {
  const partner = await prisma.partner.findFirst({
    where: {
      id: partnerId,
      organizationId,
    },
  });

  if (!partner) {
    throw new Error("Partner not found");
  }

  return prisma.partner.delete({
    where: {
      id: partnerId,
    },
  });
}

export default {
  getPartners,
  getPartnerById,
  createPartner,
  updatePartner,
  deletePartner,
};