export const LIST_ENTITY_TYPES = Object.freeze(["LEAD", "PARTNER"]);

export const CORE_COLUMN_REGISTRY = Object.freeze({
  LEAD: Object.freeze([
    { key: "name", label: "Név", required: true },
    { key: "companyName", label: "Cégnév" },
    { key: "status", label: "Státusz" },
    { key: "source", label: "Forrás" },
    { key: "email", label: "E-mail" },
    { key: "phone", label: "Telefon" },
    { key: "assignedMember", label: "Felelős" },
    { key: "createdAt", label: "Létrehozás" },
  ]),
  PARTNER: Object.freeze([
    { key: "name", label: "Partner neve", required: true },
    { key: "type", label: "Típus" },
    { key: "email", label: "Email" },
    { key: "phone", label: "Telefon" },
    { key: "website", label: "Weboldal" },
    { key: "taxNumber", label: "Adószám" },
    { key: "address", label: "Cím / Székhely" },
    { key: "createdAt", label: "Létrehozás" },
  ]),
});

export const DEFAULT_LIST_COLUMNS = Object.freeze({
  LEAD: Object.freeze(["name", "companyName", "status", "source", "email", "phone", "assignedMember", "createdAt"].map((key) => ({ type: "CORE", key }))),
  PARTNER: Object.freeze(["name", "type", "email", "phone", "website"].map((key) => ({ type: "CORE", key }))),
});

export function assertListEntityType(value) {
  if (!LIST_ENTITY_TYPES.includes(value)) {
    const error = new Error("Nem támogatott lista entitás típus.");
    error.statusCode = 400;
    throw error;
  }
}
