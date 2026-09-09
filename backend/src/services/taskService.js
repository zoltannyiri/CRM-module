import prisma from "../lib/prisma.js";
import activityService from "./activityService.js";

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

async function validateProject(organizationId, projectId, client = prisma) {
  if (projectId === null || projectId === undefined) return true;
  return client.project.findFirst({
    where: { id: projectId, organizationId },
    select: { id: true },
  });
}

async function validateAssignee(organizationId, assigneeMemberId, client = prisma) {
  if (assigneeMemberId === null || assigneeMemberId === undefined) return true;
  return client.organizationMember.findFirst({
    where: { id: assigneeMemberId, organizationId },
    select: { id: true },
  });
}

async function createTask({ organizationId, actorMemberId, data }) {
  return prisma.$transaction(async (tx) => {
    if (!(await validateProject(organizationId, data.projectId, tx))) return null;
    if (!(await validateAssignee(organizationId, data.assigneeMemberId, tx))) return null;

    const task = await tx.task.create({
      data: { ...data, organizationId },
      include: taskInclude,
    });

    await activityService.createActivity(
      {
        organizationId,
        actorMemberId,
        entityType: "TASK",
        entityId: task.id,
        action: "CREATED",
        title: "Feladat létrehozva",
        description: task.title,
        metadata: { status: task.status, priority: task.priority, projectId: task.projectId },
      },
      tx,
    );

    return task;
  });
}

function normalizeTimestamp(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  return Number.isNaN(time) ? null : time;
}

async function updateTask({ organizationId, actorMemberId, taskId, data }) {
  return prisma.$transaction(async (tx) => {
    const task = await tx.task.findFirst({
      where: { id: taskId, organizationId },
      include: {
        assigneeMember: {
          select: {
            id: true,
            user: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });
    if (!task) return null;

    if (data.projectId !== undefined && data.projectId !== null) {
      const project = await tx.project.findFirst({
        where: { id: data.projectId, organizationId },
        select: { id: true },
      });
      if (!project) return null;
    }

    let newMemberName = null;
    if (data.assigneeMemberId !== undefined && data.assigneeMemberId !== null) {
      const member = await tx.organizationMember.findFirst({
        where: { id: data.assigneeMemberId, organizationId },
        include: { user: { select: { firstName: true, lastName: true } } },
      });
      if (!member) return null;
      if (member.user) {
        newMemberName = `${member.user.firstName} ${member.user.lastName}`.trim();
      }
    }

    const statusChanged = data.status !== undefined && data.status !== task.status;
    const priorityChanged = data.priority !== undefined && data.priority !== task.priority;
    const assigneeChanged = data.assigneeMemberId !== undefined && data.assigneeMemberId !== task.assigneeMemberId;

    const candidateFields = ["title", "description", "dueDate", "projectId"];
    const otherChangedFields = candidateFields.filter((field) => {
      if (!Object.hasOwn(data, field)) return false;
      if (field === "dueDate") {
        return normalizeTimestamp(data[field]) !== normalizeTimestamp(task[field]);
      }
      return (data[field] ?? null) !== (task[field] ?? null);
    });

    const updated = await tx.task.update({
      where: { id: task.id },
      data,
      include: taskInclude,
    });

    if (statusChanged) {
      await activityService.createActivity(
        {
          organizationId,
          actorMemberId,
          entityType: "TASK",
          entityId: task.id,
          action: "STATUS_CHANGED",
          title: "Feladat státusza megváltozott",
          description: task.title,
          metadata: { field: "status", oldValue: task.status, newValue: data.status },
        },
        tx,
      );
    }

    if (priorityChanged) {
      await activityService.createActivity(
        {
          organizationId,
          actorMemberId,
          entityType: "TASK",
          entityId: task.id,
          action: "PRIORITY_CHANGED",
          title: "Feladat prioritása megváltozott",
          description: task.title,
          metadata: { field: "priority", oldValue: task.priority, newValue: data.priority },
        },
        tx,
      );
    }

    if (assigneeChanged) {
      const oldMemberName = task.assigneeMember?.user
        ? `${task.assigneeMember.user.firstName} ${task.assigneeMember.user.lastName}`.trim()
        : null;

      await activityService.createActivity(
        {
          organizationId,
          actorMemberId,
          entityType: "TASK",
          entityId: task.id,
          action: "ASSIGNED",
          title: "Feladat felelőse megváltozott",
          description: task.title,
          metadata: {
            oldAssigneeMemberId: task.assigneeMemberId,
            newAssigneeMemberId: data.assigneeMemberId,
            oldAssigneeName: oldMemberName,
            newAssigneeName: newMemberName,
          },
        },
        tx,
      );
    }

    if (otherChangedFields.length > 0) {
      await activityService.createActivity(
        {
          organizationId,
          actorMemberId,
          entityType: "TASK",
          entityId: task.id,
          action: "UPDATED",
          title: "Feladat módosítva",
          description: updated.title,
          metadata: { changedFields: otherChangedFields },
        },
        tx,
      );
    }

    return updated;
  });
}

async function deleteTask({ organizationId, actorMemberId, taskId }) {
  return prisma.$transaction(async (tx) => {
    const task = await tx.task.findFirst({
      where: { id: taskId, organizationId },
      select: { id: true, title: true },
    });
    if (!task) return false;

    await activityService.createActivity(
      {
        organizationId,
        actorMemberId,
        entityType: "TASK",
        entityId: taskId,
        action: "DELETED",
        title: "Feladat törölve",
        description: task.title,
      },
      tx,
    );

    const result = await tx.task.deleteMany({
      where: { id: taskId, organizationId },
    });
    return result.count === 1;
  });
}

export default { getTasks, getTaskById, createTask, updateTask, deleteTask };
