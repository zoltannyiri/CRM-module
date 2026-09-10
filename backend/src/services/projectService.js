import prisma from "../lib/prisma.js";
import activityService from "./activityService.js";

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

async function findOwnedPartner(organizationId, partnerId, client = prisma) {
  if (partnerId === null || partnerId === undefined) return true;
  return client.partner.findFirst({
    where: { id: partnerId, organizationId },
    select: { id: true },
  });
}

async function createProject({ organizationId, actorMemberId, data }) {
  return prisma.$transaction(async (tx) => {
    if (!(await findOwnedPartner(organizationId, data.partnerId, tx))) return null;
    const project = await tx.project.create({
      data: { ...data, organizationId },
      include: projectInclude,
    });

    await activityService.createActivity(
      {
        organizationId,
        actorMemberId,
        entityType: "PROJECT",
        entityId: project.id,
        action: "CREATED",
        title: "Projekt létrehozva",
        description: project.name,
        metadata: { status: project.status },
      },
      tx,
    );

    return project;
  });
}

function normalizeTimestamp(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  return Number.isNaN(time) ? null : time;
}

async function updateProject({ organizationId, actorMemberId, projectId, data }) {
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

    const statusChanged = data.status !== undefined && data.status !== project.status;

    const candidateFields = ["name", "description", "startDate", "deadline", "partnerId"];
    const otherChangedFields = candidateFields.filter((field) => {
      if (!Object.hasOwn(data, field)) return false;
      if (field === "startDate" || field === "deadline") {
        return normalizeTimestamp(data[field]) !== normalizeTimestamp(project[field]);
      }
      return (data[field] ?? null) !== (project[field] ?? null);
    });

    const updated = await transaction.project.update({
      where: { id: project.id },
      data,
      include: projectInclude,
    });

    if (statusChanged) {
      await activityService.createActivity(
        {
          organizationId,
          actorMemberId,
          entityType: "PROJECT",
          entityId: project.id,
          action: "STATUS_CHANGED",
          title: "Projekt státusza megváltozott",
          description: project.name,
          metadata: { field: "status", oldValue: project.status, newValue: data.status },
        },
        transaction,
      );
    }

    if (otherChangedFields.length > 0) {
      await activityService.createActivity(
        {
          organizationId,
          actorMemberId,
          entityType: "PROJECT",
          entityId: project.id,
          action: "UPDATED",
          title: "Projekt módosítva",
          description: updated.name,
          metadata: { changedFields: otherChangedFields },
        },
        transaction,
      );
    }

    return updated;
  });
}

async function deleteProject({ organizationId, actorMemberId, projectId }) {
  return prisma.$transaction(async (tx) => {
    const project = await tx.project.findFirst({
      where: { id: projectId, organizationId },
      select: { id: true, name: true },
    });
    if (!project) return false;

    await activityService.createActivity(
      {
        organizationId,
        actorMemberId,
        entityType: "PROJECT",
        entityId: projectId,
        action: "DELETED",
        title: "Projekt törölve",
        description: project.name,
      },
      tx,
    );

    await tx.documentLink.deleteMany({
      where: { entityType: "PROJECT", entityId: projectId },
    });

    const result = await tx.project.deleteMany({ where: { id: projectId, organizationId } });
    return result.count === 1;
  });
}

export default { getProjects, getProjectById, createProject, updateProject, deleteProject };
