import prisma from "../lib/prisma.js";

const taskInclude = {
  project: { select: { id: true, name: true } },
  assigneeMember: {
    select: {
      id: true,
      role: true,
      user: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  },
};

async function getTasks({ organizationId, query = "", status, priority, projectId, assigneeMemberId, sortDirection = "desc" }) {
  const term = query.trim();
  return prisma.task.findMany({
    where: {
      organizationId,
      ...(status ? { status } : {}),
      ...(priority ? { priority } : {}),
      ...(projectId ? { projectId } : {}),
      ...(assigneeMemberId ? { assigneeMemberId } : {}),
      ...(term ? {
        OR: [
          { title: { contains: term, mode: "insensitive" } },
          { description: { contains: term, mode: "insensitive" } },
          { project: { name: { contains: term, mode: "insensitive" } } },
        ],
      } : {}),
    },
    include: taskInclude,
    orderBy: { id: sortDirection === "asc" ? "asc" : "desc" },
  });
}

async function getTaskById({ organizationId, taskId }) {
  return prisma.task.findFirst({
    where: { id: taskId, organizationId },
    include: taskInclude,
  });
}

async function validateProject(organizationId, projectId) {
  if (projectId === null || projectId === undefined) return true;
  return prisma.project.findFirst({
    where: { id: projectId, organizationId },
    select: { id: true },
  });
}

async function validateAssignee(organizationId, assigneeMemberId) {
  if (assigneeMemberId === null || assigneeMemberId === undefined) return true;
  return prisma.organizationMember.findFirst({
    where: { id: assigneeMemberId, organizationId },
    select: { id: true },
  });
}

async function createTask({ organizationId, data }) {
  if (!(await validateProject(organizationId, data.projectId))) return null;
  if (!(await validateAssignee(organizationId, data.assigneeMemberId))) return null;
  return prisma.task.create({
    data: { ...data, organizationId },
    include: taskInclude,
  });
}

async function updateTask({ organizationId, taskId, data }) {
  return prisma.$transaction(async (tx) => {
    const task = await tx.task.findFirst({
      where: { id: taskId, organizationId },
    });
    if (!task) return null;

    if (data.projectId !== undefined && data.projectId !== null) {
      const project = await tx.project.findFirst({
        where: { id: data.projectId, organizationId },
        select: { id: true },
      });
      if (!project) return null;
    }

    if (data.assigneeMemberId !== undefined && data.assigneeMemberId !== null) {
      const member = await tx.organizationMember.findFirst({
        where: { id: data.assigneeMemberId, organizationId },
        select: { id: true },
      });
      if (!member) return null;
    }

    return tx.task.update({
      where: { id: task.id },
      data,
      include: taskInclude,
    });
  });
}

async function deleteTask({ organizationId, taskId }) {
  const result = await prisma.task.deleteMany({
    where: { id: taskId, organizationId },
  });
  return result.count === 1;
}

export default { getTasks, getTaskById, createTask, updateTask, deleteTask };
