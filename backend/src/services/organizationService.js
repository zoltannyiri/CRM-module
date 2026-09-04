import prisma from "../lib/prisma.js";

export const getDefaultMembership = (userId) => {
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    throw new Error("Érvénytelen felhasználó azonosító.");
  }

  return prisma.organizationMember.findFirst({
    where: { userId },
    orderBy: { id: "asc" },
    include: { organization: true },
  });
};
