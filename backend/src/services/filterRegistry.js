export const FILTER_ENTITY_TYPES = Object.freeze(["LEAD", "PARTNER"]);

export const CORE_FILTER_REGISTRY = Object.freeze({
  LEAD: Object.freeze({
    name: Object.freeze({ valueType: "TEXT", label: "Név" }),
    companyName: Object.freeze({ valueType: "TEXT", label: "Cégnév" }),
    status: Object.freeze({
      valueType: "SELECT",
      label: "Státusz",
      options: Object.freeze(["NEW", "CONTACTED", "QUALIFIED", "LOST"]),
    }),
    source: Object.freeze({
      valueType: "SELECT",
      label: "Forrás",
      options: Object.freeze(["WEBSITE", "REFERRAL", "PHONE", "EMAIL", "SOCIAL", "OTHER"]),
    }),
    email: Object.freeze({ valueType: "TEXT", label: "E-mail" }),
    phone: Object.freeze({ valueType: "TEXT", label: "Telefon" }),
    assignedMember: Object.freeze({ valueType: "MEMBER", label: "Felelős" }),
    createdAt: Object.freeze({ valueType: "DATETIME", label: "Létrehozás" }),
  }),
  PARTNER: Object.freeze({
    name: Object.freeze({ valueType: "TEXT", label: "Partner neve" }),
    type: Object.freeze({
      valueType: "SELECT",
      label: "Típus",
      options: Object.freeze(["COMPANY", "PERSON"]),
    }),
    email: Object.freeze({ valueType: "TEXT", label: "Email" }),
    phone: Object.freeze({ valueType: "TEXT", label: "Telefon" }),
    website: Object.freeze({ valueType: "TEXT", label: "Weboldal" }),
    taxNumber: Object.freeze({ valueType: "TEXT", label: "Adószám" }),
    address: Object.freeze({ valueType: "TEXT", label: "Cím / Székhely" }),
    createdAt: Object.freeze({ valueType: "DATETIME", label: "Létrehozás" }),
  }),
});

export const VALUE_TYPE_OPERATORS = Object.freeze({
  TEXT: Object.freeze(["CONTAINS", "EQUALS", "NOT_EQUALS", "IS_EMPTY", "IS_NOT_EMPTY"]),
  TEXTAREA: Object.freeze(["CONTAINS", "EQUALS", "NOT_EQUALS", "IS_EMPTY", "IS_NOT_EMPTY"]),
  NUMBER: Object.freeze([
    "EQUALS",
    "NOT_EQUALS",
    "GREATER_THAN",
    "GREATER_THAN_OR_EQUAL",
    "LESS_THAN",
    "LESS_THAN_OR_EQUAL",
    "IS_EMPTY",
    "IS_NOT_EMPTY",
  ]),
  MONEY: Object.freeze([
    "EQUALS",
    "NOT_EQUALS",
    "GREATER_THAN",
    "GREATER_THAN_OR_EQUAL",
    "LESS_THAN",
    "LESS_THAN_OR_EQUAL",
    "IS_EMPTY",
    "IS_NOT_EMPTY",
  ]),
  BOOLEAN: Object.freeze(["EQUALS", "IS_EMPTY", "IS_NOT_EMPTY"]),
  DATE: Object.freeze(["EQUALS", "BEFORE", "AFTER", "ON_OR_BEFORE", "ON_OR_AFTER", "BETWEEN", "IS_EMPTY", "IS_NOT_EMPTY"]),
  DATETIME: Object.freeze(["EQUALS", "BEFORE", "AFTER", "ON_OR_BEFORE", "ON_OR_AFTER", "BETWEEN", "IS_EMPTY", "IS_NOT_EMPTY"]),
  SELECT: Object.freeze(["EQUALS", "NOT_EQUALS", "IN", "NOT_IN", "IS_EMPTY", "IS_NOT_EMPTY"]),
  MULTI_SELECT: Object.freeze(["CONTAINS_ANY", "CONTAINS_ALL", "IS_EMPTY", "IS_NOT_EMPTY"]),
  MEMBER: Object.freeze(["EQUALS", "NOT_EQUALS", "IS_EMPTY", "IS_NOT_EMPTY"]),
});

export function getAllowedOperatorsForValueType(valueType) {
  return VALUE_TYPE_OPERATORS[valueType] || [];
}

export function getAllowedOperatorsForCustomFieldType(fieldType) {
  return VALUE_TYPE_OPERATORS[fieldType] || [];
}
