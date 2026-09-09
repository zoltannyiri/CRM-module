import prisma from "../lib/prisma.js";

const activityInclude = {
  actorMember: {
    select: {
      id: true,
      role: true,
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    },
  },
};

/**
 * Creates an activity log entry.
 * Can be called with a Prisma transaction client (tx) or defaults to the global prisma instance.
 */
async function createActivity(
  {
    organizationId,
    actorMemberId = null,
    entityType,
    entityId,
    action,
    title,
    description = null,
    metadata = null,
  },
  client = prisma,
) {
  if (!organizationId || !entityType || !entityId || !action || !title) {
    throw new Error("Hiányzó kötelező mezők a tevékenység létrehozásához.");
  }

  return client.activity.create({
    data: {
      organizationId,
      actorMemberId: actorMemberId || null,
      entityType,
      entityId,
      action,
      title,
      description: description || null,
      metadata: metadata || null,
    },
    include: activityInclude,
  });
}

/**
 * Retrieves activities for an organization with optional filters.
 */
async function getActivities({
  organizationId,
  entityType,
  entityId,
  actorMemberId,
  action,
  limit = 50,
  sortDirection = "desc",
}) {
  const safeLimit = Math.min(Math.max(1, Number(limit) || 50), 100);

  return prisma.activity.findMany({
    where: {
      organizationId,
      ...(entityType ? { entityType } : {}),
      ...(entityId ? { entityId } : {}),
      ...(actorMemberId ? { actorMemberId } : {}),
      ...(action ? { action } : {}),
    },
    include: activityInclude,
    orderBy: {
      createdAt: sortDirection === "asc" ? "asc" : "desc",
    },
    take: safeLimit,
  });
}

export default {
  createActivity,
  getActivities,
};
