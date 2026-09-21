import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma.js";

function isValidDateOnly(val) {
  return typeof val === "string" && /^\d{4}-\d{2}-\d{2}$/.test(val);
}

function getTableSql(client) {
  const schema = (
    client?._engineConfig?.adapter?.options?.schema ||
    client?._parent?._engineConfig?.adapter?.options?.schema ||
    client?._appliedParent?._engineConfig?.adapter?.options?.schema ||
    null
  );
  if (schema && /^[a-zA-Z0-9_]+$/.test(schema)) {
    return {
      table: Prisma.raw(`"${schema}"."CustomFieldValue"`),
      enumType: Prisma.raw(`"${schema}"."CustomFieldEntityType"`),
    };
  }
  return {
    table: Prisma.raw(`"CustomFieldValue"`),
    enumType: Prisma.raw(`"CustomFieldEntityType"`),
  };
}

export function buildCoreFilterPrismaWhere(coreFilters) {
  if (!coreFilters || !coreFilters.length) return [];

  const conditions = [];

  for (const filter of coreFilters) {
    const key = filter.field.key;
    const op = filter.operator;
    const val = filter.value;

    switch (key) {
      case "name":
      case "companyName":
      case "email":
      case "phone":
      case "website":
      case "taxNumber":
      case "address": {
        if (op === "CONTAINS") {
          conditions.push({ [key]: { contains: val, mode: "insensitive" } });
        } else if (op === "EQUALS") {
          conditions.push({ [key]: { equals: val, mode: "insensitive" } });
        } else if (op === "NOT_EQUALS") {
          conditions.push({ NOT: { [key]: { equals: val, mode: "insensitive" } } });
        } else if (op === "IS_EMPTY") {
          conditions.push({ OR: [{ [key]: null }, { [key]: "" }] });
        } else if (op === "IS_NOT_EMPTY") {
          conditions.push({ AND: [{ [key]: { not: null } }, { [key]: { not: "" } }] });
        }
        break;
      }

      case "status":
      case "source":
      case "type": {
        if (op === "EQUALS") {
          conditions.push({ [key]: val });
        } else if (op === "NOT_EQUALS") {
          conditions.push({ [key]: { not: val } });
        } else if (op === "IN") {
          conditions.push({ [key]: { in: val } });
        } else if (op === "NOT_IN") {
          conditions.push({ [key]: { notIn: val } });
        } else if (op === "IS_EMPTY") {
          conditions.push({ [key]: null });
        } else if (op === "IS_NOT_EMPTY") {
          conditions.push({ [key]: { not: null } });
        }
        break;
      }

      case "assignedMember": {
        if (op === "EQUALS") {
          conditions.push({ assignedMemberId: val });
        } else if (op === "NOT_EQUALS") {
          conditions.push({ NOT: { assignedMemberId: val } });
        } else if (op === "IS_EMPTY") {
          conditions.push({ assignedMemberId: null });
        } else if (op === "IS_NOT_EMPTY") {
          conditions.push({ assignedMemberId: { not: null } });
        }
        break;
      }

      case "createdAt": {
        if (op === "IS_EMPTY") {
          conditions.push({ createdAt: null });
        } else if (op === "IS_NOT_EMPTY") {
          conditions.push({ createdAt: { not: null } });
        } else if (op === "BETWEEN") {
          const fromStart = isValidDateOnly(val.from) ? `${val.from}T00:00:00.000Z` : val.from;
          const toEnd = isValidDateOnly(val.to) ? `${val.to}T23:59:59.999Z` : val.to;
          conditions.push({
            createdAt: {
              gte: new Date(fromStart),
              lte: new Date(toEnd),
            },
          });
        } else if (isValidDateOnly(val)) {
          const dayStart = new Date(`${val}T00:00:00.000Z`);
          const dayEnd = new Date(`${val}T23:59:59.999Z`);
          if (op === "EQUALS") {
            conditions.push({ createdAt: { gte: dayStart, lte: dayEnd } });
          } else if (op === "BEFORE") {
            conditions.push({ createdAt: { lt: dayStart } });
          } else if (op === "AFTER") {
            conditions.push({ createdAt: { gt: dayEnd } });
          } else if (op === "ON_OR_BEFORE") {
            conditions.push({ createdAt: { lte: dayEnd } });
          } else if (op === "ON_OR_AFTER") {
            conditions.push({ createdAt: { gte: dayStart } });
          }
        } else {
          const timestamp = new Date(val);
          if (op === "EQUALS") {
            conditions.push({ createdAt: timestamp });
          } else if (op === "BEFORE") {
            conditions.push({ createdAt: { lt: timestamp } });
          } else if (op === "AFTER") {
            conditions.push({ createdAt: { gt: timestamp } });
          } else if (op === "ON_OR_BEFORE") {
            conditions.push({ createdAt: { lte: timestamp } });
          } else if (op === "ON_OR_AFTER") {
            conditions.push({ createdAt: { gte: timestamp } });
          }
        }
        break;
      }

      default:
        break;
    }
  }

  return conditions;
}

export async function resolveCustomFieldMatchingEntityIds(
  { organizationId, entityType, customFieldFilters },
  client = prisma
) {
  if (!customFieldFilters || !customFieldFilters.length) {
    return null;
  }

  const { table, enumType } = getTableSql(client);
  const positiveSets = [];
  const exclusionSets = [];

  for (const filter of customFieldFilters) {
    const cfId = filter.field.customFieldId;
    const fieldType = filter._customField?.fieldType || "TEXT";
    const op = filter.operator;
    const val = filter.value;

    let rows = [];

    if (op === "IS_EMPTY") {
      const nonEmpties = await client.customFieldValue.findMany({
        where: {
          organizationId,
          entityType,
          customFieldId: cfId,
          value: { not: null },
          NOT: [{ value: "" }, { value: "[]" }],
        },
        select: { entityId: true },
      });
      exclusionSets.push(new Set(nonEmpties.map((r) => r.entityId)));
      continue;
    }

    if (op === "IS_NOT_EMPTY") {
      const nonEmpties = await client.customFieldValue.findMany({
        where: {
          organizationId,
          entityType,
          customFieldId: cfId,
          value: { not: null },
          NOT: [{ value: "" }, { value: "[]" }],
        },
        select: { entityId: true },
      });
      positiveSets.push(new Set(nonEmpties.map((r) => r.entityId)));
      continue;
    }

    switch (fieldType) {
      case "NUMBER":
      case "MONEY": {
        const num = Number(val);
        if (op === "EQUALS") {
          rows = await client.$queryRaw`
            SELECT "entityId" FROM ${table}
            WHERE "organizationId" = ${organizationId}
              AND "entityType" = ${entityType}::${enumType}
              AND "customFieldId" = ${cfId}
              AND btrim("value") ~ '^-?[0-9]+(\.[0-9]+)?$'
              AND btrim("value")::numeric = ${num}
          `;
        } else if (op === "NOT_EQUALS") {
          rows = await client.$queryRaw`
            SELECT "entityId" FROM ${table}
            WHERE "organizationId" = ${organizationId}
              AND "entityType" = ${entityType}::${enumType}
              AND "customFieldId" = ${cfId}
              AND btrim("value") ~ '^-?[0-9]+(\.[0-9]+)?$'
              AND btrim("value")::numeric != ${num}
          `;
        } else if (op === "GREATER_THAN") {
          rows = await client.$queryRaw`
            SELECT "entityId" FROM ${table}
            WHERE "organizationId" = ${organizationId}
              AND "entityType" = ${entityType}::${enumType}
              AND "customFieldId" = ${cfId}
              AND btrim("value") ~ '^-?[0-9]+(\.[0-9]+)?$'
              AND btrim("value")::numeric > ${num}
          `;
        } else if (op === "GREATER_THAN_OR_EQUAL") {
          rows = await client.$queryRaw`
            SELECT "entityId" FROM ${table}
            WHERE "organizationId" = ${organizationId}
              AND "entityType" = ${entityType}::${enumType}
              AND "customFieldId" = ${cfId}
              AND btrim("value") ~ '^-?[0-9]+(\.[0-9]+)?$'
              AND btrim("value")::numeric >= ${num}
          `;
        } else if (op === "LESS_THAN") {
          rows = await client.$queryRaw`
            SELECT "entityId" FROM ${table}
            WHERE "organizationId" = ${organizationId}
              AND "entityType" = ${entityType}::${enumType}
              AND "customFieldId" = ${cfId}
              AND btrim("value") ~ '^-?[0-9]+(\.[0-9]+)?$'
              AND btrim("value")::numeric < ${num}
          `;
        } else if (op === "LESS_THAN_OR_EQUAL") {
          rows = await client.$queryRaw`
            SELECT "entityId" FROM ${table}
            WHERE "organizationId" = ${organizationId}
              AND "entityType" = ${entityType}::${enumType}
              AND "customFieldId" = ${cfId}
              AND btrim("value") ~ '^-?[0-9]+(\.[0-9]+)?$'
              AND btrim("value")::numeric <= ${num}
          `;
        }
        break;
      }

      case "DATE": {
        if (op === "EQUALS") {
          rows = await client.$queryRaw`
            SELECT "entityId" FROM ${table}
            WHERE "organizationId" = ${organizationId}
              AND "entityType" = ${entityType}::${enumType}
              AND "customFieldId" = ${cfId}
              AND btrim("value") ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
              AND btrim("value")::date = ${val}::date
          `;
        } else if (op === "BEFORE") {
          rows = await client.$queryRaw`
            SELECT "entityId" FROM ${table}
            WHERE "organizationId" = ${organizationId}
              AND "entityType" = ${entityType}::${enumType}
              AND "customFieldId" = ${cfId}
              AND btrim("value") ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
              AND btrim("value")::date < ${val}::date
          `;
        } else if (op === "AFTER") {
          rows = await client.$queryRaw`
            SELECT "entityId" FROM ${table}
            WHERE "organizationId" = ${organizationId}
              AND "entityType" = ${entityType}::${enumType}
              AND "customFieldId" = ${cfId}
              AND btrim("value") ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
              AND btrim("value")::date > ${val}::date
          `;
        } else if (op === "ON_OR_BEFORE") {
          rows = await client.$queryRaw`
            SELECT "entityId" FROM ${table}
            WHERE "organizationId" = ${organizationId}
              AND "entityType" = ${entityType}::${enumType}
              AND "customFieldId" = ${cfId}
              AND btrim("value") ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
              AND btrim("value")::date <= ${val}::date
          `;
        } else if (op === "ON_OR_AFTER") {
          rows = await client.$queryRaw`
            SELECT "entityId" FROM ${table}
            WHERE "organizationId" = ${organizationId}
              AND "entityType" = ${entityType}::${enumType}
              AND "customFieldId" = ${cfId}
              AND btrim("value") ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
              AND btrim("value")::date >= ${val}::date
          `;
        } else if (op === "BETWEEN") {
          rows = await client.$queryRaw`
            SELECT "entityId" FROM ${table}
            WHERE "organizationId" = ${organizationId}
              AND "entityType" = ${entityType}::${enumType}
              AND "customFieldId" = ${cfId}
              AND btrim("value") ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
              AND btrim("value")::date >= ${val.from}::date
              AND btrim("value")::date <= ${val.to}::date
          `;
        }
        break;
      }

      case "DATETIME": {
        if (op === "BETWEEN") {
          const fromIso = isValidDateOnly(val.from) ? `${val.from}T00:00:00.000Z` : val.from;
          const toIso = isValidDateOnly(val.to) ? `${val.to}T23:59:59.999Z` : val.to;
          rows = await client.$queryRaw`
            SELECT "entityId" FROM ${table}
            WHERE "organizationId" = ${organizationId}
              AND "entityType" = ${entityType}::${enumType}
              AND "customFieldId" = ${cfId}
              AND btrim("value") ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
              AND btrim("value")::timestamptz >= ${fromIso}::timestamptz
              AND btrim("value")::timestamptz <= ${toIso}::timestamptz
          `;
        } else if (isValidDateOnly(val)) {
          const dayStart = `${val}T00:00:00.000Z`;
          const dayEnd = `${val}T23:59:59.999Z`;
          if (op === "EQUALS") {
            rows = await client.$queryRaw`
              SELECT "entityId" FROM ${table}
              WHERE "organizationId" = ${organizationId}
                AND "entityType" = ${entityType}::${enumType}
                AND "customFieldId" = ${cfId}
                AND btrim("value") ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
                AND btrim("value")::timestamptz >= ${dayStart}::timestamptz
                AND btrim("value")::timestamptz <= ${dayEnd}::timestamptz
            `;
          } else if (op === "BEFORE") {
            rows = await client.$queryRaw`
              SELECT "entityId" FROM ${table}
              WHERE "organizationId" = ${organizationId}
                AND "entityType" = ${entityType}::${enumType}
                AND "customFieldId" = ${cfId}
                AND btrim("value") ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
                AND btrim("value")::timestamptz < ${dayStart}::timestamptz
            `;
          } else if (op === "AFTER") {
            rows = await client.$queryRaw`
              SELECT "entityId" FROM ${table}
              WHERE "organizationId" = ${organizationId}
                AND "entityType" = ${entityType}::${enumType}
                AND "customFieldId" = ${cfId}
                AND btrim("value") ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
                AND btrim("value")::timestamptz > ${dayEnd}::timestamptz
            `;
          } else if (op === "ON_OR_BEFORE") {
            rows = await client.$queryRaw`
              SELECT "entityId" FROM ${table}
              WHERE "organizationId" = ${organizationId}
                AND "entityType" = ${entityType}::${enumType}
                AND "customFieldId" = ${cfId}
                AND btrim("value") ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
                AND btrim("value")::timestamptz <= ${dayEnd}::timestamptz
            `;
          } else if (op === "ON_OR_AFTER") {
            rows = await client.$queryRaw`
              SELECT "entityId" FROM ${table}
              WHERE "organizationId" = ${organizationId}
                AND "entityType" = ${entityType}::${enumType}
                AND "customFieldId" = ${cfId}
                AND btrim("value") ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
                AND btrim("value")::timestamptz >= ${dayStart}::timestamptz
            `;
          }
        } else {
          if (op === "EQUALS") {
            rows = await client.$queryRaw`
              SELECT "entityId" FROM ${table}
              WHERE "organizationId" = ${organizationId}
                AND "entityType" = ${entityType}::${enumType}
                AND "customFieldId" = ${cfId}
                AND btrim("value") ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
                AND btrim("value")::timestamptz = ${val}::timestamptz
            `;
          } else if (op === "BEFORE") {
            rows = await client.$queryRaw`
              SELECT "entityId" FROM ${table}
              WHERE "organizationId" = ${organizationId}
                AND "entityType" = ${entityType}::${enumType}
                AND "customFieldId" = ${cfId}
                AND btrim("value") ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
                AND btrim("value")::timestamptz < ${val}::timestamptz
            `;
          } else if (op === "AFTER") {
            rows = await client.$queryRaw`
              SELECT "entityId" FROM ${table}
              WHERE "organizationId" = ${organizationId}
                AND "entityType" = ${entityType}::${enumType}
                AND "customFieldId" = ${cfId}
                AND btrim("value") ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
                AND btrim("value")::timestamptz > ${val}::timestamptz
            `;
          } else if (op === "ON_OR_BEFORE") {
            rows = await client.$queryRaw`
              SELECT "entityId" FROM ${table}
              WHERE "organizationId" = ${organizationId}
                AND "entityType" = ${entityType}::${enumType}
                AND "customFieldId" = ${cfId}
                AND btrim("value") ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
                AND btrim("value")::timestamptz <= ${val}::timestamptz
            `;
          } else if (op === "ON_OR_AFTER") {
            rows = await client.$queryRaw`
              SELECT "entityId" FROM ${table}
              WHERE "organizationId" = ${organizationId}
                AND "entityType" = ${entityType}::${enumType}
                AND "customFieldId" = ${cfId}
                AND btrim("value") ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
                AND btrim("value")::timestamptz >= ${val}::timestamptz
            `;
          }
        }
        break;
      }

      case "BOOLEAN": {
        if (op === "EQUALS") {
          rows = await client.customFieldValue.findMany({
            where: {
              organizationId,
              entityType,
              customFieldId: cfId,
              value: String(val),
            },
            select: { entityId: true },
          });
        }
        break;
      }

      case "SELECT": {
        if (op === "EQUALS") {
          rows = await client.customFieldValue.findMany({
            where: {
              organizationId,
              entityType,
              customFieldId: cfId,
              value: val,
            },
            select: { entityId: true },
          });
        } else if (op === "NOT_EQUALS") {
          rows = await client.customFieldValue.findMany({
            where: {
              organizationId,
              entityType,
              customFieldId: cfId,
              value: { not: val },
            },
            select: { entityId: true },
          });
        } else if (op === "IN") {
          rows = await client.customFieldValue.findMany({
            where: {
              organizationId,
              entityType,
              customFieldId: cfId,
              value: { in: val },
            },
            select: { entityId: true },
          });
        } else if (op === "NOT_IN") {
          rows = await client.customFieldValue.findMany({
            where: {
              organizationId,
              entityType,
              customFieldId: cfId,
              value: { notIn: val },
            },
            select: { entityId: true },
          });
        }
        break;
      }

      case "MULTI_SELECT": {
        if (op === "CONTAINS_ANY") {
          rows = await client.$queryRaw`
            SELECT "entityId" FROM ${table}
            WHERE "organizationId" = ${organizationId}
              AND "entityType" = ${entityType}::${enumType}
              AND "customFieldId" = ${cfId}
              AND btrim("value") ~ '^\\[.*\\]$'
              AND (
                SELECT count(1)
                FROM jsonb_array_elements_text("value"::jsonb) elem
                WHERE elem = ANY(${val}::text[])
              ) > 0
          `;
        } else if (op === "CONTAINS_ALL") {
          const neededCount = val.length;
          rows = await client.$queryRaw`
            SELECT "entityId" FROM ${table}
            WHERE "organizationId" = ${organizationId}
              AND "entityType" = ${entityType}::${enumType}
              AND "customFieldId" = ${cfId}
              AND btrim("value") ~ '^\\[.*\\]$'
              AND (
                SELECT count(DISTINCT elem)
                FROM jsonb_array_elements_text("value"::jsonb) elem
                WHERE elem = ANY(${val}::text[])
              ) = ${neededCount}
          `;
        }
        break;
      }

      case "TEXT":
      case "TEXTAREA":
      default: {
        if (op === "CONTAINS") {
          rows = await client.customFieldValue.findMany({
            where: {
              organizationId,
              entityType,
              customFieldId: cfId,
              value: { contains: val, mode: "insensitive" },
            },
            select: { entityId: true },
          });
        } else if (op === "EQUALS") {
          rows = await client.customFieldValue.findMany({
            where: {
              organizationId,
              entityType,
              customFieldId: cfId,
              value: { equals: val, mode: "insensitive" },
            },
            select: { entityId: true },
          });
        } else if (op === "NOT_EQUALS") {
          rows = await client.customFieldValue.findMany({
            where: {
              organizationId,
              entityType,
              customFieldId: cfId,
              NOT: { value: { equals: val, mode: "insensitive" } },
            },
            select: { entityId: true },
          });
        }
        break;
      }
    }

    positiveSets.push(new Set(rows.map((r) => r.entityId)));
  }

  if (positiveSets.length > 0) {
    let candidateSet = positiveSets[0];
    for (let i = 1; i < positiveSets.length; i++) {
      const nextSet = positiveSets[i];
      const intersected = new Set();
      for (const id of candidateSet) {
        if (nextSet.has(id)) intersected.add(id);
      }
      candidateSet = intersected;
      if (candidateSet.size === 0) break;
    }

    for (const exclSet of exclusionSets) {
      for (const id of exclSet) {
        candidateSet.delete(id);
      }
    }

    return { in: Array.from(candidateSet) };
  }

  if (exclusionSets.length > 0) {
    const unionExclusions = new Set();
    for (const exclSet of exclusionSets) {
      for (const id of exclSet) unionExclusions.add(id);
    }
    return { notIn: Array.from(unionExclusions) };
  }

  return null;
}
