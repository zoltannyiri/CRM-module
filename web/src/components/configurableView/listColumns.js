export const defaultListColumns = Object.freeze({
  LEAD: Object.freeze([
    ["name", "Név", true], ["companyName", "Cégnév"], ["status", "Státusz"], ["source", "Forrás"],
    ["email", "E-mail"], ["phone", "Telefon"], ["assignedMember", "Felelős"], ["createdAt", "Létrehozás"],
  ].map(([key, label, required]) => ({ type: "CORE", key, label, required: required === true }))),
  PARTNER: Object.freeze([
    ["name", "Partner neve", true], ["type", "Típus"], ["email", "Email"], ["phone", "Telefon"], ["website", "Weboldal"],
  ].map(([key, label, required]) => ({ type: "CORE", key, label, required: required === true }))),
});

export const columnIdentity = (column) => column.type === "CORE" ? `CORE:${column.key}` : `CUSTOM_FIELD:${column.customFieldId}`;
export const storedColumn = (column) => column.type === "CORE" ? { type: "CORE", key: column.key } : { type: "CUSTOM_FIELD", customFieldId: column.customFieldId };

export function toggleListColumn(columns, column, checked) {
  const identity = columnIdentity(column);
  if (checked) return columns.some((item) => columnIdentity(item) === identity) ? columns : [...columns, column];
  if (column.required) return columns;
  return columns.filter((item) => columnIdentity(item) !== identity);
}

export function moveListColumn(columns, index, direction) {
  const target = index + direction;
  if (index < 0 || target < 0 || index >= columns.length || target >= columns.length) return columns;
  const next = [...columns];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function formatCustomFieldValue(value, fieldType) {
  if (value === null || value === undefined || value === "") return "—";
  if (fieldType === "BOOLEAN") return value === "true" ? "Igen" : value === "false" ? "Nem" : String(value);
  if (fieldType === "NUMBER" || fieldType === "MONEY") {
    const number = Number(value);
    if (!Number.isFinite(number)) return String(value);
    return new Intl.NumberFormat("hu-HU", fieldType === "MONEY" ? { style: "currency", currency: "HUF", maximumFractionDigits: 2 } : { maximumFractionDigits: 20 }).format(number);
  }
  if (fieldType === "DATE") {
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat("hu-HU", { timeZone: "UTC" }).format(date);
  }
  if (fieldType === "DATETIME") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat("hu-HU", { dateStyle: "short", timeStyle: "short" }).format(date);
  }
  if (fieldType === "MULTI_SELECT") {
    try { const values = JSON.parse(value); return Array.isArray(values) ? values.join(", ") || "—" : String(value); } catch { return String(value); }
  }
  return String(value);
}
