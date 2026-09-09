import prisma from "../lib/prisma.js";
import {
  getMemberPermissions,
  setMemberPermissions,
} from "./permissionService.js";

async function getMembers({ organizationId }) {
  return prisma.organizationMember.findMany({
    where: { organizationId },
    include: {
      user: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
    },
    orderBy: { id: "asc" },
  });
}

export default { getMembers, getMemberPermissions, setMemberPermissions };
