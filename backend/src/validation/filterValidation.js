import prisma from "../lib/prisma.js";
import {
  CORE_FILTER_REGISTRY,
  getAllowedOperatorsForCustomFieldType,
  getAllowedOperatorsForValueType,
} from "../services/filterRegistry.js";

const MAX_FILTERS = 20;
const MAX_OPTION_LIST_SIZE = 50;

function isValidDateOnly(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isValidDateTime(value) {
  if (typeof value !== "string") return false;
  if (isValidDateOnly(value)) return true;
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value)) return false;
  const time = Date.parse(value);
  return !Number.isNaN(time);
}

function positiveId(value) {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 && value <= 2147483647 ? value : null;
  }
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id <= 2147483647 ? id : null;
}

export async function normalizeFilters(rawFilters, { organizationId, entityType }, client = prisma) {
  if (rawFilters === undefined || rawFilters === null || rawFilters === "") {
    return { data: [] };
  }

  let parsed = rawFilters;
  if (typeof rawFilters === "string") {
    try {
      parsed = JSON.parse(rawFilters);
    } catch {
      return { error: "Érvénytelen szűrő JSON formátum." };
    }
  }

  if (!Array.isArray(parsed)) {
    return { error: "A szűrőknek listának (tömbnek) kell lenniük." };
  }

  if (parsed.length > MAX_FILTERS) {
    return { error: `Legfeljebb ${MAX_FILTERS} szűrő adható meg egyszerre.` };
  }

  const customFieldIds = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return { error: "Minden szűrőnek objektumnak kell lennie." };
    }
    if (!item.field || typeof item.field !== "object" || Array.isArray(item.field)) {
      return { error: "A szűrő mező meghatározása hiányzik vagy érvénytelen." };
    }
    if (item.field.type === "CUSTOM_FIELD") {
      const id = positiveId(item.field.customFieldId);
      if (!id) return { error: "Érvénytelen egyéni mező azonosító a szűrőben." };
      customFieldIds.push(id);
    }
  }

  let customFieldMap = new Map();
  if (customFieldIds.length > 0) {
    const fields = await client.customField.findMany({
      where: {
        id: { in: Array.from(new Set(customFieldIds)) },
        organizationId,
      },
      select: {
        id: true,
        entityType: true,
        active: true,
        fieldType: true,
        label: true,
        options: true,
      },
    });
    customFieldMap = new Map(fields.map((field) => [field.id, field]));
  }

  const normalized = [];

  for (const item of parsed) {
    const { field, operator, value } = item;
    if (typeof operator !== "string" || !operator.trim()) {
      return { error: "A szűrő operátor kötelező." };
    }
    const cleanOp = operator.trim().toUpperCase();

    if (field.type === "CORE") {
      const coreKey = field.key;
      if (typeof coreKey !== "string" || !Object.hasOwn(CORE_FILTER_REGISTRY[entityType] || {}, coreKey)) {
        return { error: "Ismeretlen vagy nem támogatott alap mező a szűrőben." };
      }
      const coreDef = CORE_FILTER_REGISTRY[entityType][coreKey];
      const allowedOps = getAllowedOperatorsForValueType(coreDef.valueType);
      if (!allowedOps.includes(cleanOp)) {
        return { error: `Nem támogatott operátor (${cleanOp}) a(z) ${coreDef.label} mezőhöz.` };
      }

      const valNorm = validateAndNormalizeValue(cleanOp, value, coreDef.valueType, coreDef.options);
      if (valNorm.error) return { error: valNorm.error };

      normalized.push({
        field: { type: "CORE", key: coreKey },
        operator: cleanOp,
        value: valNorm.data,
      });
    } else if (field.type === "CUSTOM_FIELD") {
      const fieldId = positiveId(field.customFieldId);
      const customField = customFieldMap.get(fieldId);
      if (!customField) {
        return { error: "Ismeretlen vagy nem elérhető egyéni mező." };
      }
      if (customField.entityType !== entityType) {
        return { error: "Az egyéni mező másik entitáshoz tartozik." };
      }
      if (!customField.active) {
        return { error: "Inaktív egyéni mező nem használható szűréshez." };
      }

      const allowedOps = getAllowedOperatorsForCustomFieldType(customField.fieldType);
      if (!allowedOps.includes(cleanOp)) {
        return { error: `Nem támogatott operátor (${cleanOp}) a(z) ${customField.label} mezőhöz.` };
      }

      const valNorm = validateAndNormalizeValue(
        cleanOp,
        value,
        customField.fieldType,
        Array.isArray(customField.options) ? customField.options : []
      );
      if (valNorm.error) return { error: valNorm.error };

      normalized.push({
        field: { type: "CUSTOM_FIELD", customFieldId: customField.id },
        operator: cleanOp,
        value: valNorm.data,
        _customField: customField,
      });
    } else {
      return { error: "Érvénytelen mezőtípus a szűrőben (csak CORE vagy CUSTOM_FIELD lehet)." };
    }
  }

  return { data: normalized };
}

function validateAndNormalizeValue(operator, value, valueType, options = []) {
  if (operator === "IS_EMPTY" || operator === "IS_NOT_EMPTY") {
    return { data: null };
  }

  if (value === undefined || value === null) {
    return { error: "A szűrő értéke kötelező ehhez az operátorhoz." };
  }

  switch (valueType) {
    case "TEXT":
    case "TEXTAREA": {
      if (typeof value !== "string") return { error: "A szűrő értéke szöveges kell legyen." };
      const trimmed = value.trim();
      if (!trimmed) return { error: "A szűrő értéke nem lehet üres." };
      const maxLen = valueType === "TEXTAREA" ? 2000 : 500;
      if (trimmed.length > maxLen) return { error: `A szöveges szűrő legfeljebb ${maxLen} karakter lehet.` };
      return { data: trimmed };
    }

    case "NUMBER":
    case "MONEY": {
      const num = typeof value === "number" ? value : Number(String(value).trim());
      if (!Number.isFinite(num)) return { error: "A szűrő értéke szám kell legyen." };
      return { data: num };
    }

    case "BOOLEAN": {
      if (typeof value === "boolean") return { data: value ? "true" : "false" };
      if (typeof value === "string") {
        const lower = value.trim().toLowerCase();
        if (lower === "true" || lower === "false") return { data: lower };
      }
      return { error: "A logikai szűrő értéke csak igaz (true) vagy hamis (false) lehet." };
    }

    case "DATE": {
      if (operator === "BETWEEN") {
        const between = normalizeBetween(value, isValidDateOnly);
        if (between.error) return between;
        if (between.data.from > between.data.to) {
          return { error: "A kezdő dátum nem lehet későbbi a záró dátumnál." };
        }
        return between;
      }
      if (!isValidDateOnly(String(value).trim())) {
        return { error: "Érvénytelen dátum formátum (ÉÉÉÉ-HH-NN szükséges)." };
      }
      return { data: String(value).trim() };
    }

    case "DATETIME": {
      if (operator === "BETWEEN") {
        const between = normalizeBetween(value, isValidDateTime);
        if (between.error) return between;
        const fromDate = new Date(between.data.from);
        const toDate = new Date(between.data.to);
        if (fromDate.getTime() > toDate.getTime()) {
          return { error: "A kezdő időpont nem lehet későbbi a záró időpontnál." };
        }
        return between;
      }
      const str = String(value).trim();
      if (!isValidDateTime(str)) {
        return { error: "Érvénytelen dátum vagy időpont formátum." };
      }
      return { data: str };
    }

    case "SELECT": {
      const allowedOptions = Array.isArray(options) ? options : [];
      if (operator === "IN" || operator === "NOT_IN") {
        if (!Array.isArray(value) || value.length < 1) {
          return { error: "Az IN operátor értéke nem üres lista kell legyen." };
        }
        if (value.length > MAX_OPTION_LIST_SIZE) {
          return { error: `Legfeljebb ${MAX_OPTION_LIST_SIZE} választási lehetőség adható meg.` };
        }
        const cleaned = [];
        for (const opt of value) {
          if (typeof opt !== "string") return { error: "A választott opcióknak szövegesnek kell lenniük." };
          const trimmed = opt.trim();
          if (!allowedOptions.includes(trimmed)) {
            return { error: `Érvénytelen választási opció: ${trimmed}` };
          }
          if (!cleaned.includes(trimmed)) cleaned.push(trimmed);
        }
        return { data: cleaned };
      }
      if (typeof value !== "string") return { error: "A választott opciónak szövegesnek kell lennie." };
      const trimmed = value.trim();
      if (!allowedOptions.includes(trimmed)) {
        return { error: `Érvénytelen választási opció: ${trimmed}` };
      }
      return { data: trimmed };
    }

    case "MULTI_SELECT": {
      const allowedOptions = Array.isArray(options) ? options : [];
      const list = Array.isArray(value) ? value : [value];
      if (list.length < 1) return { error: "A többválasztós szűrő értéke nem lehet üres." };
      if (list.length > MAX_OPTION_LIST_SIZE) {
        return { error: `Legfeljebb ${MAX_OPTION_LIST_SIZE} választási lehetőség adható meg.` };
      }
      const cleaned = [];
      for (const opt of list) {
        if (typeof opt !== "string") return { error: "A választott opcióknak szövegesnek kell lenniük." };
        const trimmed = opt.trim();
        if (!allowedOptions.includes(trimmed)) {
          return { error: `Érvénytelen választási opció: ${trimmed}` };
        }
        if (!cleaned.includes(trimmed)) cleaned.push(trimmed);
      }
      return { data: cleaned };
    }

    case "MEMBER": {
      const memberId = positiveId(value);
      if (!memberId) return { error: "Érvénytelen felelős azonosító a szűrőben." };
      return { data: memberId };
    }

    default:
      return { error: "Nem támogatott mezőtípus." };
  }
}

function normalizeBetween(value, validator) {
  if (Array.isArray(value)) {
    if (value.length !== 2) return { error: "A BETWEEN szűrő pontosan 2 értéket (tól, ig) igényel." };
    const from = String(value[0]).trim();
    const to = String(value[1]).trim();
    if (!validator(from) || !validator(to)) {
      return { error: "A BETWEEN szűrő határai érvénytelen formátumúak." };
    }
    return { data: { from, to } };
  }
  if (value && typeof value === "object") {
    const from = String(value.from || "").trim();
    const to = String(value.to || "").trim();
    if (!validator(from) || !validator(to)) {
      return { error: "A BETWEEN szűrő határai érvénytelen formátumúak." };
    }
    return { data: { from, to } };
  }
  return { error: "A BETWEEN operátor objektumot ({ from, to }) vagy tömböt ([from, to]) igényel." };
}
