import prisma from "../lib/prisma.js";
import { CORE_COLUMN_REGISTRY, DEFAULT_LIST_COLUMNS, assertListEntityType } from "./viewPreferenceRegistry.js";

export class ViewPreferenceError extends Error {
  constructor(message, statusCode = 400, code) { super(message); this.statusCode = statusCode; this.code = code; }
}

function columnIdentity(column) {
  return column.type === "CORE" ? `CORE:${column.key}` : `CUSTOM_FIELD:${column.customFieldId}`;
}

export async function normalizePreferenceColumns({ organizationId, entityType, columns }, client = prisma) {
  assertListEntityType(entityType);
  if (!Array.isArray(columns) || columns.length < 1 || columns.length > 50) throw new ViewPreferenceError("Az oszlopok listája 1–50 elemet tartalmazhat.");
  const coreByKey = new Map(CORE_COLUMN_REGISTRY[entityType].map((column) => [column.key, column]));
  const normalized = [];
  const customFieldIds = [];
  const seen = new Set();
  for (const column of columns) {
    if (!column || typeof column !== "object" || Array.isArray(column)) throw new ViewPreferenceError("Érvénytelen oszlop konfiguráció.");
    if (column.type === "CORE") {
      if (Object.keys(column).some((key) => !["type", "key"].includes(key)) || typeof column.key !== "string" || !coreByKey.has(column.key)) throw new ViewPreferenceError("Ismeretlen alap oszlop.");
      normalized.push({ type: "CORE", key: column.key });
    } else if (column.type === "CUSTOM_FIELD") {
      if (Object.keys(column).some((key) => !["type", "customFieldId"].includes(key)) || !Number.isSafeInteger(column.customFieldId) || column.customFieldId <= 0) throw new ViewPreferenceError("Érvénytelen egyéni mező oszlop.");
      normalized.push({ type: "CUSTOM_FIELD", customFieldId: column.customFieldId });
      customFieldIds.push(column.customFieldId);
    } else throw new ViewPreferenceError("Érvénytelen oszlop típus.");
    const identity = columnIdentity(normalized.at(-1));
    if (seen.has(identity)) throw new ViewPreferenceError("Egy oszlop csak egyszer szerepelhet.");
    seen.add(identity);
  }
  if (!seen.has("CORE:name")) throw new ViewPreferenceError("A Név oszlop kötelező.");
  if (customFieldIds.length) {
    const fields = await client.customField.findMany({
      where: { id: { in: customFieldIds }, organizationId, entityType, active: true },
      select: { id: true },
    });
    if (fields.length !== customFieldIds.length) throw new ViewPreferenceError("Az egyik egyéni mező nem létezik, inaktív vagy másik entitáshoz tartozik.");
  }
  return normalized;
}

function enrichCore(entityType, column) {
  const definition = CORE_COLUMN_REGISTRY[entityType].find(({ key }) => key === column.key);
  return definition ? { ...column, label: definition.label, required: definition.required === true } : null;
}

export async function getResolvedPreference({ organizationId, organizationMemberId, entityType }, client = prisma) {
  assertListEntityType(entityType);
  const [preference, customFields] = await Promise.all([
    client.entityListPreference.findFirst({ where: { organizationId, organizationMemberId, entityType }, select: { columns: true, version: true } }),
    client.customField.findMany({
      where: { organizationId, entityType, active: true },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      select: { id: true, label: true, fieldType: true, options: true },
    }),
  ]);
  const customById = new Map(customFields.map((field) => [field.id, field]));
  const stored = Array.isArray(preference?.columns) ? preference.columns : DEFAULT_LIST_COLUMNS[entityType];
  const columns = stored.map((column) => column?.type === "CORE"
    ? enrichCore(entityType, column)
    : column?.type === "CUSTOM_FIELD" && customById.has(column.customFieldId)
      ? { type: "CUSTOM_FIELD", customFieldId: column.customFieldId, label: customById.get(column.customFieldId).label, fieldType: customById.get(column.customFieldId).fieldType }
      : null).filter(Boolean);
  if (!columns.some((column) => column.type === "CORE" && column.key === "name")) columns.unshift(enrichCore(entityType, { type: "CORE", key: "name" }));
  const availableColumns = [
    ...CORE_COLUMN_REGISTRY[entityType].map((column) => ({ type: "CORE", key: column.key, label: column.label, required: column.required === true })),
    ...customFields.map((field) => ({ type: "CUSTOM_FIELD", customFieldId: field.id, label: field.label, fieldType: field.fieldType, options: field.options })),
  ];
  return { entityType, version: preference?.version || 1, customized: Boolean(preference), columns, availableColumns };
}

export async function savePreference(args, client = prisma) {
  const columns = await normalizePreferenceColumns(args, client);
  await client.entityListPreference.upsert({
    where: { organizationMemberId_entityType: { organizationMemberId: args.organizationMemberId, entityType: args.entityType } },
    update: { organizationId: args.organizationId, version: 1, columns },
    create: { organizationId: args.organizationId, organizationMemberId: args.organizationMemberId, entityType: args.entityType, version: 1, columns },
  });
  return getResolvedPreference(args, client);
}

export async function resetPreference(args, client = prisma) {
  await client.entityListPreference.deleteMany({ where: { organizationId: args.organizationId, organizationMemberId: args.organizationMemberId, entityType: args.entityType } });
  return getResolvedPreference(args, client);
}

export default { getResolvedPreference, savePreference, resetPreference, normalizePreferenceColumns };
