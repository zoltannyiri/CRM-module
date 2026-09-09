import { PermissionKey } from "@prisma/client";

import prisma from "../lib/prisma.js";

export const ALL_PERMISSION_KEYS = Object.freeze(Object.values(PermissionKey));
export const DEFAULT_PERMISSIONS_BY_ROLE = Object.freeze({
  OWNER: ALL_PERMISSION_KEYS,
  ADMIN: ALL_PERMISSION_KEYS,
  USER: ALL_PERMISSION_KEYS,
});

const permissionKeySet = new Set(ALL_PERMISSION_KEYS);

export class PermissionManagementError extends Error {
  constructor(message, statusCode = 403) {
    super(message);
    this.statusCode = statusCode;
  }
}

export function assertValidPermissionKey(permissionKey) {
  if (!permissionKeySet.has(permissionKey)) {
    throw new Error(`Érvénytelen PermissionKey konfiguráció: ${String(permissionKey)}`);
  }
}

export function getAllPermissionKeys() {
  return [...ALL_PERMISSION_KEYS];
}

export async function getEffectivePermissions(membership, client = prisma) {
  if (!membership) return [];
  if (membership.role === "OWNER") return getAllPermissionKeys();

  const records = membership.permissions || await client.organizationMemberPermission.findMany({
    where: { organizationMemberId: membership.id },
    select: { permission: true },
    orderBy: { id: "asc" },
  });
  return records.map(({ permission }) => permission);
}

export async function hasPermission(membership, permissionKey, client = prisma) {
  assertValidPermissionKey(permissionKey);
  if (membership?.role === "OWNER") return true;
  const record = await client.organizationMemberPermission.findUnique({
    where: {
      organizationMemberId_permission: {
        organizationMemberId: membership.id,
        permission: permissionKey,
      },
    },
    select: { id: true },
  });
  return Boolean(record);
}

export async function initializeMemberPermissions(memberId, role, client = prisma) {
  if (role === "OWNER") return;
  const permissions = DEFAULT_PERMISSIONS_BY_ROLE[role];
  if (!permissions) throw new Error(`Ismeretlen szervezeti szerepkör: ${String(role)}`);
  await client.organizationMemberPermission.createMany({
    data: permissions.map((permission) => ({ organizationMemberId: memberId, permission })),
    skipDuplicates: true,
  });
}

function normalizePermissions(permissions) {
  if (!Array.isArray(permissions)) {
    throw new PermissionManagementError("A permissions mezőnek tömbnek kell lennie.", 400);
  }
  const unique = [...new Set(permissions)];
  for (const permission of unique) {
    if (!permissionKeySet.has(permission)) {
      throw new PermissionManagementError(`Érvénytelen jogosultság: ${String(permission)}`, 400);
    }
  }
  return unique;
}

function assertCanManage(actor, target, { modifying = false } = {}) {
  if (target.role === "OWNER") {
    throw new PermissionManagementError("A tulajdonos jogosultságai nem módosíthatók.");
  }
  if (actor.role === "OWNER") return;
  if (actor.role !== "ADMIN" || target.role !== "USER") {
    throw new PermissionManagementError("Nincs jogosultsága ennek a tagnak a kezeléséhez.");
  }
  if (modifying && actor.id === target.id) {
    throw new PermissionManagementError("Az adminisztrátor nem módosíthatja a saját jogosultságait.");
  }
}

async function findTargetMember(organizationId, memberId, client) {
  const target = await client.organizationMember.findFirst({
    where: { id: memberId, organizationId },
    include: {
      user: { select: { id: true, firstName: true, lastName: true, email: true } },
      permissions: { select: { permission: true }, orderBy: { id: "asc" } },
    },
  });
  if (!target) throw new PermissionManagementError("Szervezeti tag nem található.", 404);
  return target;
}

export async function getMemberPermissions({ actorMembership, memberId }, client = prisma) {
  const target = await findTargetMember(actorMembership.organizationId, memberId, client);
  if (target.role === "OWNER" && actorMembership.role !== "OWNER") {
    throw new PermissionManagementError("Nincs jogosultsága ennek a tagnak a kezeléséhez.");
  }
  if (target.role !== "OWNER") assertCanManage(actorMembership, target);
  return { member: target, permissions: await getEffectivePermissions(target, client) };
}

export async function setMemberPermissions({ actorMembership, memberId, permissions }) {
  const normalized = normalizePermissions(permissions);
  return prisma.$transaction(async (transaction) => {
    const target = await findTargetMember(actorMembership.organizationId, memberId, transaction);
    assertCanManage(actorMembership, target, { modifying: true });

    if (actorMembership.role === "ADMIN") {
      const actorPermissions = new Set(await getEffectivePermissions(actorMembership, transaction));
      if (normalized.some((permission) => !actorPermissions.has(permission))) {
        throw new PermissionManagementError("Az adminisztrátor csak saját jogosultságai közül adhat tovább.");
      }
    }

    await transaction.organizationMemberPermission.deleteMany({
      where: { organizationMemberId: target.id },
    });
    if (normalized.length > 0) {
      await transaction.organizationMemberPermission.createMany({
        data: normalized.map((permission) => ({ organizationMemberId: target.id, permission })),
      });
    }
    return { member: target, permissions: normalized };
  });
}

export default {
  getEffectivePermissions,
  hasPermission,
  setMemberPermissions,
  initializeMemberPermissions,
  getAllPermissionKeys,
};
