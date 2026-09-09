import prisma from "../lib/prisma.js";

const projectInclude = {
  partner: { select: { id: true, name: true, type: true } },
};

export class ProjectInputError extends Error {}

async function getProjects({ organizationId, query = "", status, partnerId, sortDirection = "desc" }) {
  const term = query.trim();
  return prisma.project.findMany({
    where: {
      organizationId,
      ...(status ? { status } : {}),
      ...(partnerId ? { partnerId } : {}),
      ...(term ? {
        OR: [
          { name: { contains: term, mode: "insensitive" } },
          { description: { contains: term, mode: "insensitive" } },
          { partner: { name: { contains: term, mode: "insensitive" } } },
        ],
      } : {}),
    },
    include: projectInclude,
    orderBy: { id: sortDirection === "asc" ? "asc" : "desc" },
  });
}

async function getProjectById({ organizationId, projectId }) {
  return prisma.project.findFirst({
    where: { id: projectId, organizationId },
    include: projectInclude,
  });
}

async function findOwnedPartner(organizationId, partnerId) {
  if (partnerId === null || partnerId === undefined) return true;
  return prisma.partner.findFirst({
    where: { id: partnerId, organizationId },
    select: { id: true },
  });
}

async function createProject({ organizationId, data }) {
  if (!(await findOwnedPartner(organizationId, data.partnerId))) return null;
  return prisma.project.create({
    data: { ...data, organizationId },
    include: projectInclude,
  });
}

async function updateProject({ organizationId, projectId, data }) {
  return prisma.$transaction(async (transaction) => {
    const project = await transaction.project.findFirst({
      where: { id: projectId, organizationId },
    });
    if (!project) return null;

    if (data.partnerId !== undefined && data.partnerId !== null) {
      const partner = await transaction.partner.findFirst({
        where: { id: data.partnerId, organizationId },
        select: { id: true },
      });
      if (!partner) return null;
    }

    const startDate = data.startDate !== undefined ? data.startDate : project.startDate;
    const deadline = data.deadline !== undefined ? data.deadline : project.deadline;
    if (startDate && deadline && deadline < startDate) {
      throw new ProjectInputError("A határidő nem lehet korábbi a kezdési dátumnál.");
    }

    return transaction.project.update({
      where: { id: project.id },
      data,
      include: projectInclude,
    });
  });
}

async function deleteProject({ organizationId, projectId }) {
  const result = await prisma.project.deleteMany({ where: { id: projectId, organizationId } });
  return result.count === 1;
}

export default { getProjects, getProjectById, createProject, updateProject, deleteProject };
