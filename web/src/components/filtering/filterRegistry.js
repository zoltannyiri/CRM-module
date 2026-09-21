export const FILTER_OPERATOR_LABELS = Object.freeze({
  CONTAINS: "tartalmazza",
  EQUALS: "egyenlő",
  NOT_EQUALS: "nem egyenlő",
  GREATER_THAN: "nagyobb mint",
  GREATER_THAN_OR_EQUAL: "nagyobb vagy egyenlő",
  LESS_THAN: "kisebb mint",
  LESS_THAN_OR_EQUAL: "kisebb vagy egyenlő",
  BEFORE: "előtt",
  AFTER: "után",
  ON_OR_BEFORE: "legkésőbb ekkor",
  ON_OR_AFTER: "legkorábban ekkor",
  BETWEEN: "között",
  IN: "ezek egyike",
  NOT_IN: "ezek egyike sem",
  CONTAINS_ANY: "tartalmazza bármelyiket",
  CONTAINS_ALL: "tartalmazza mindegyiket",
  IS_EMPTY: "üres",
  IS_NOT_EMPTY: "nem üres",
});

export const CORE_FILTER_DEFINITIONS = Object.freeze({
  LEAD: Object.freeze([
    { type: "CORE", key: "name", label: "Név", valueType: "TEXT" },
    { type: "CORE", key: "companyName", label: "Cégnév", valueType: "TEXT" },
    {
      type: "CORE",
      key: "status",
      label: "Státusz",
      valueType: "SELECT",
      options: [
        { value: "NEW", label: "Új" },
        { value: "CONTACTED", label: "Kapcsolatfelvétel" },
        { value: "QUALIFIED", label: "Minősített" },
        { value: "LOST", label: "Elvesztett" },
      ],
    },
    {
      type: "CORE",
      key: "source",
      label: "Forrás",
      valueType: "SELECT",
      options: [
        { value: "WEBSITE", label: "Weboldal" },
        { value: "REFERRAL", label: "Ajánlás" },
        { value: "PHONE", label: "Telefon" },
        { value: "EMAIL", label: "E-mail" },
        { value: "SOCIAL", label: "Közösségi média" },
        { value: "OTHER", label: "Egyéb" },
      ],
    },
    { type: "CORE", key: "email", label: "E-mail", valueType: "TEXT" },
    { type: "CORE", key: "phone", label: "Telefon", valueType: "TEXT" },
    { type: "CORE", key: "assignedMember", label: "Felelős", valueType: "MEMBER" },
    { type: "CORE", key: "createdAt", label: "Létrehozás dátuma", valueType: "DATETIME" },
  ]),
  PARTNER: Object.freeze([
    { type: "CORE", key: "name", label: "Partner neve", valueType: "TEXT" },
    {
      type: "CORE",
      key: "type",
      label: "Típus",
      valueType: "SELECT",
      options: [
        { value: "COMPANY", label: "Cég" },
        { value: "PERSON", label: "Magánszemély" },
      ],
    },
    { type: "CORE", key: "email", label: "Email", valueType: "TEXT" },
    { type: "CORE", key: "phone", label: "Telefon", valueType: "TEXT" },
    { type: "CORE", key: "website", label: "Weboldal", valueType: "TEXT" },
    { type: "CORE", key: "taxNumber", label: "Adószám", valueType: "TEXT" },
    { type: "CORE", key: "address", label: "Cím / Székhely", valueType: "TEXT" },
    { type: "CORE", key: "createdAt", label: "Létrehozás dátuma", valueType: "DATETIME" },
  ]),
});

export const OPERATORS_BY_VALUE_TYPE = Object.freeze({
  TEXT: ["CONTAINS", "EQUALS", "NOT_EQUALS", "IS_EMPTY", "IS_NOT_EMPTY"],
  TEXTAREA: ["CONTAINS", "EQUALS", "NOT_EQUALS", "IS_EMPTY", "IS_NOT_EMPTY"],
  NUMBER: [
    "EQUALS",
    "NOT_EQUALS",
    "GREATER_THAN",
    "GREATER_THAN_OR_EQUAL",
    "LESS_THAN",
    "LESS_THAN_OR_EQUAL",
    "IS_EMPTY",
    "IS_NOT_EMPTY",
  ],
  MONEY: [
    "EQUALS",
    "NOT_EQUALS",
    "GREATER_THAN",
    "GREATER_THAN_OR_EQUAL",
    "LESS_THAN",
    "LESS_THAN_OR_EQUAL",
    "IS_EMPTY",
    "IS_NOT_EMPTY",
  ],
  BOOLEAN: ["EQUALS", "IS_EMPTY", "IS_NOT_EMPTY"],
  DATE: ["EQUALS", "BEFORE", "AFTER", "ON_OR_BEFORE", "ON_OR_AFTER", "BETWEEN", "IS_EMPTY", "IS_NOT_EMPTY"],
  DATETIME: ["EQUALS", "BEFORE", "AFTER", "ON_OR_BEFORE", "ON_OR_AFTER", "BETWEEN", "IS_EMPTY", "IS_NOT_EMPTY"],
  SELECT: ["EQUALS", "NOT_EQUALS", "IN", "NOT_IN", "IS_EMPTY", "IS_NOT_EMPTY"],
  MULTI_SELECT: ["CONTAINS_ANY", "CONTAINS_ALL", "IS_EMPTY", "IS_NOT_EMPTY"],
  MEMBER: ["EQUALS", "NOT_EQUALS", "IS_EMPTY", "IS_NOT_EMPTY"],
});

export function getFieldType(field) {
  if (!field) return "TEXT";
  if (field.type === "CORE") return field.valueType || "TEXT";
  return field.fieldType || "TEXT";
}

export function getOperatorsForField(field) {
  const type = getFieldType(field);
  return OPERATORS_BY_VALUE_TYPE[type] || OPERATORS_BY_VALUE_TYPE.TEXT;
}

export function getDefaultOperatorForField(field) {
  const ops = getOperatorsForField(field);
  return ops[0] || "EQUALS";
}

export function getDefaultValueForOperator(field, operator) {
  if (operator === "IS_EMPTY" || operator === "IS_NOT_EMPTY") return null;
  const type = getFieldType(field);
  if (operator === "BETWEEN") return { from: "", to: "" };
  if (operator === "IN" || operator === "NOT_IN" || type === "MULTI_SELECT") return [];
  if (type === "BOOLEAN") return "true";
  if (type === "NUMBER" || type === "MONEY") return "";
  if (type === "SELECT") {
    const opts = field.options || [];
    if (opts.length > 0) {
      return typeof opts[0] === "object" ? opts[0].value : opts[0];
    }
    return "";
  }
  return "";
}

export function fieldKey(field) {
  if (!field) return "";
  return field.type === "CORE" ? `CORE:${field.key}` : `CUSTOM_FIELD:${field.customFieldId}`;
}

export function buildFieldList(entityType, availableColumns = []) {
  const coreDefs = (CORE_FILTER_DEFINITIONS[entityType] || []).map((def) => ({
    type: "CORE",
    key: def.key,
    label: def.label,
    valueType: def.valueType,
    options: def.options,
  }));

  const customDefs = (availableColumns || [])
    .filter((col) => col.type === "CUSTOM_FIELD")
    .map((col) => ({
      type: "CUSTOM_FIELD",
      customFieldId: col.customFieldId,
      label: col.label,
      fieldType: col.fieldType,
      options: col.options,
    }));

  return [...coreDefs, ...customDefs];
}

export function findFieldDefinition(fieldList, field) {
  if (!field) return null;
  const targetKey = fieldKey(field);
  return fieldList.find((f) => fieldKey(f) === targetKey) || null;
}

export function createDefaultFilter(fieldList) {
  const first = fieldList[0];
  if (!first) {
    return {
      field: { type: "CORE", key: "name" },
      operator: "CONTAINS",
      value: "",
    };
  }
  const op = getDefaultOperatorForField(first);
  return {
    field:
      first.type === "CORE"
        ? { type: "CORE", key: first.key }
        : { type: "CUSTOM_FIELD", customFieldId: first.customFieldId },
    operator: op,
    value: getDefaultValueForOperator(first, op),
  };
}

export function buildFieldListForColumns(entityType, columns = [], availableColumns = []) {
  if (!columns || columns.length === 0) {
    return buildFieldList(entityType, availableColumns);
  }

  const allAvailable = buildFieldList(entityType, availableColumns);
  const result = [];

  for (const col of columns) {
    const key = fieldKey(col);
    const def = allAvailable.find((f) => fieldKey(f) === key);
    if (def) {
      result.push(def);
    } else {
      result.push({
        type: col.type,
        ...(col.type === "CORE" ? { key: col.key } : { customFieldId: col.customFieldId }),
        label: col.label,
        valueType: col.valueType || col.fieldType || "TEXT",
        options: col.options,
      });
    }
  }

  return result;
}

export function panelValuesToCanonicalFilters(panelValues = {}, fieldList = []) {
  const filters = [];

  for (const field of fieldList) {
    const key = fieldKey(field);
    const val = panelValues[key];
    if (val === undefined || val === null || val === "") continue;

    const type = getFieldType(field);
    const fieldPayload =
      field.type === "CORE"
        ? { type: "CORE", key: field.key }
        : { type: "CUSTOM_FIELD", customFieldId: field.customFieldId };

    if (type === "NUMBER" || type === "MONEY") {
      if (typeof val === "object") {
        if (val.min !== undefined && val.min !== null && String(val.min).trim() !== "") {
          filters.push({
            field: fieldPayload,
            operator: "GREATER_THAN_OR_EQUAL",
            value: Number(val.min),
          });
        }
        if (val.max !== undefined && val.max !== null && String(val.max).trim() !== "") {
          filters.push({
            field: fieldPayload,
            operator: "LESS_THAN_OR_EQUAL",
            value: Number(val.max),
          });
        }
      } else if (String(val).trim() !== "") {
        filters.push({
          field: fieldPayload,
          operator: "EQUALS",
          value: Number(val),
        });
      }
    } else if (type === "DATE" || type === "DATETIME") {
      if (typeof val === "object") {
        const from = val.from ? String(val.from).trim() : "";
        const to = val.to ? String(val.to).trim() : "";
        if (from && to) {
          filters.push({
            field: fieldPayload,
            operator: "BETWEEN",
            value: { from, to },
          });
        } else if (from) {
          filters.push({
            field: fieldPayload,
            operator: "ON_OR_AFTER",
            value: from,
          });
        } else if (to) {
          filters.push({
            field: fieldPayload,
            operator: "ON_OR_BEFORE",
            value: to,
          });
        }
      } else if (String(val).trim() !== "") {
        filters.push({
          field: fieldPayload,
          operator: "EQUALS",
          value: String(val).trim(),
        });
      }
    } else if (type === "SELECT" || type === "MEMBER") {
      const trimmed = String(val).trim();
      if (trimmed) {
        filters.push({
          field: fieldPayload,
          operator: "EQUALS",
          value: trimmed,
        });
      }
    } else if (type === "BOOLEAN") {
      if (val === "true" || val === true) {
        filters.push({
          field: fieldPayload,
          operator: "EQUALS",
          value: "true",
        });
      } else if (val === "false" || val === false) {
        filters.push({
          field: fieldPayload,
          operator: "EQUALS",
          value: "false",
        });
      }
    } else {
      // TEXT, TEXTAREA, MULTI_SELECT, etc.
      const text = String(val).trim();
      if (text) {
        filters.push({
          field: fieldPayload,
          operator: "CONTAINS",
          value: text,
        });
      }
    }
  }

  return filters;
}

export function canonicalFiltersToPanelValues(filters = [], fieldList = []) {
  const panelValues = {};

  for (const filter of filters) {
    if (!filter?.field) continue;
    const key = fieldKey(filter.field);
    const def = findFieldDefinition(fieldList, filter.field);
    const type = getFieldType(def || filter.field);

    if (type === "NUMBER" || type === "MONEY") {
      const current = typeof panelValues[key] === "object" ? { ...panelValues[key] } : { min: "", max: "" };
      if (filter.operator === "GREATER_THAN_OR_EQUAL" || filter.operator === "GREATER_THAN") {
        current.min = filter.value ?? "";
      } else if (filter.operator === "LESS_THAN_OR_EQUAL" || filter.operator === "LESS_THAN") {
        current.max = filter.value ?? "";
      } else if (filter.operator === "EQUALS") {
        current.min = filter.value ?? "";
        current.max = filter.value ?? "";
      }
      panelValues[key] = current;
    } else if (type === "DATE" || type === "DATETIME") {
      const current = typeof panelValues[key] === "object" ? { ...panelValues[key] } : { from: "", to: "" };
      if (filter.operator === "BETWEEN" && typeof filter.value === "object") {
        current.from = filter.value.from ?? "";
        current.to = filter.value.to ?? "";
      } else if (filter.operator === "ON_OR_AFTER" || filter.operator === "AFTER") {
        current.from = filter.value ?? "";
      } else if (filter.operator === "ON_OR_BEFORE" || filter.operator === "BEFORE") {
        current.to = filter.value ?? "";
      } else if (filter.operator === "EQUALS") {
        current.from = filter.value ?? "";
        current.to = filter.value ?? "";
      }
      panelValues[key] = current;
    } else {
      panelValues[key] = filter.value ?? "";
    }
  }

  return panelValues;
}
