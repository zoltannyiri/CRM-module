import { ModuleKey } from "@prisma/client";
import prisma from "../lib/prisma.js";

export const MODULE_KEYS = Object.freeze(Object.values(ModuleKey));

export const DEFAULT_ORGANIZATION_MODULES = Object.freeze([
  "PARTNERS",
  "PROJECTS",
  "TASKS",
  "DOCUMENTS",
  "OFFERS",
]);

const moduleKeySet = new Set(MODULE_KEYS);

export function assertValidModuleKey(moduleKey) {
  if (!moduleKeySet.has(moduleKey)) {
    throw new Error(`Érvénytelen ModuleKey konfiguráció: ${String(moduleKey)}`);
  }
}

export async function getEnabledModules(organizationId, client = prisma) {
  const records = await client.organizationModule.findMany({
    where: { organizationId, enabled: true },
    select: { module: true },
    orderBy: { id: "asc" },
  });
  return records.map(({ module }) => module);
}

export async function isModuleEnabled(organizationId, moduleKey, client = prisma) {
  assertValidModuleKey(moduleKey);
  const record = await client.organizationModule.findUnique({
    where: { organizationId_module: { organizationId, module: moduleKey } },
    select: { enabled: true },
  });
  return record?.enabled === true;
}

export async function initializeOrganizationModules(
  organizationId,
  moduleKeys = DEFAULT_ORGANIZATION_MODULES,
  client = prisma,
) {
  for (const moduleKey of moduleKeys) assertValidModuleKey(moduleKey);
  if (moduleKeys.length === 0) return;

  await client.organizationModule.createMany({
    data: moduleKeys.map((module) => ({ organizationId, module, enabled: true })),
    skipDuplicates: true,
  });
}

export default {
  getEnabledModules,
  isModuleEnabled,
  initializeOrganizationModules,
};
