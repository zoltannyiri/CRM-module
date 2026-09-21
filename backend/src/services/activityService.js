import { ActivityEntityType, ModuleKey, PermissionKey } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { getEnabledModules } from "./organizationModuleService.js";
import { getEffectivePermissions } from "./permissionService.js";

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
 * Returns the list of ActivityEntityType values the user is allowed to view
 * based on enabled organization modules and effective member permissions.
 */
export function getAllowedActivityEntityTypes({ enabledModules = [], permissions = [] } = {}) {
  const modules = enabledModules instanceof Set ? enabledModules : new Set(enabledModules);
  const perms = permissions instanceof Set ? permissions : new Set(permissions);

  if (!perms.has(PermissionKey.ACTIVITY_VIEW) && !perms.has("ACTIVITY_VIEW")) {
    return [];
  }

  const allowed = [];
  const hasPartners = (modules.has(ModuleKey.PARTNERS) || modules.has("PARTNERS")) &&
    (perms.has(PermissionKey.PARTNERS_VIEW) || perms.has("PARTNERS_VIEW"));
  if (hasPartners) {
    allowed.push(ActivityEntityType.PARTNER, ActivityEntityType.CONTACT);
  }

  const hasProjects = (modules.has(ModuleKey.PROJECTS) || modules.has("PROJECTS")) &&
    (perms.has(PermissionKey.PROJECTS_VIEW) || perms.has("PROJECTS_VIEW"));
  if (hasProjects) {
    allowed.push(ActivityEntityType.PROJECT);
  }

  const hasTasks = (modules.has(ModuleKey.TASKS) || modules.has("TASKS")) &&
    (perms.has(PermissionKey.TASKS_VIEW) || perms.has("TASKS_VIEW"));
  if (hasTasks) {
    allowed.push(ActivityEntityType.TASK);
  }

  const hasDocuments = (modules.has(ModuleKey.DOCUMENTS) || modules.has("DOCUMENTS")) &&
    (perms.has(PermissionKey.DOCUMENTS_VIEW) || perms.has("DOCUMENTS_VIEW"));
  if (hasDocuments) {
    allowed.push(ActivityEntityType.DOCUMENT);
  }

  const hasOffers = (modules.has(ModuleKey.OFFERS) || modules.has("OFFERS")) &&
    (perms.has(PermissionKey.OFFERS_VIEW) || perms.has("OFFERS_VIEW"));
  if (hasOffers) {
    allowed.push(ActivityEntityType.OFFER);
  }

  if (modules.has("LEADS") && perms.has("LEADS_VIEW")) allowed.push(ActivityEntityType.LEAD);
  if (modules.has("FOLLOW_UPS") && modules.has("LEADS") && perms.has("FOLLOW_UPS_VIEW") && perms.has("LEADS_VIEW")) allowed.push(ActivityEntityType.FOLLOW_UP);
  if (modules.has("INCOMING_INVOICES") && perms.has("INCOMING_INVOICES_VIEW")) allowed.push(ActivityEntityType.INCOMING_INVOICE);

  return allowed;
}

export function canViewPipelineActivities({ enabledModules = [], permissions = [] } = {}) {
  const modules = new Set(enabledModules);
  const perms = new Set(permissions);
  return ["PIPELINE", "LEADS"].every((key) => modules.has(key)) &&
    ["ACTIVITY_VIEW", "PIPELINE_VIEW", "LEADS_VIEW"].every((key) => perms.has(key));
}

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
async function getActivities(
  {
    organizationId,
    membership,
    allowedEntityTypes,
    entityType,
    entityId,
    actorMemberId,
    action,
    limit = 50,
    sortDirection = "desc",
  },
  client = prisma,
) {
  let effectiveAllowedTypes = allowedEntityTypes;
  let pipelineActivitiesAllowed = false;
  // Pipeline moves expose both domains. Filter them in the DB before applying limit.
  if (membership) {
    const [modules, permissions] = await Promise.all([
      getEnabledModules(organizationId, client),
      getEffectivePermissions(membership, client),
    ]);
    pipelineActivitiesAllowed = canViewPipelineActivities({ enabledModules: modules, permissions });
    if (!effectiveAllowedTypes) effectiveAllowedTypes = getAllowedActivityEntityTypes({ enabledModules: modules, permissions });
  }

  if (effectiveAllowedTypes) {
    if (effectiveAllowedTypes.length === 0) {
      return [];
    }
    if (entityType && !effectiveAllowedTypes.includes(entityType)) {
      return [];
    }
  }

  const safeLimit = Math.min(Math.max(1, Number(limit) || 50), 100);

  return client.activity.findMany({
    where: {
      organizationId,
      ...(!pipelineActivitiesAllowed && { NOT: { action: "PIPELINE_STAGE_CHANGED" } }),
      ...(entityType
        ? { entityType }
        : effectiveAllowedTypes
          ? { entityType: { in: effectiveAllowedTypes } }
          : {}),
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
  getAllowedActivityEntityTypes,
};
export {
  createActivity,
  getActivities,
};
