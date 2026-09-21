export const documentTypeLabels = Object.freeze({
  GENERAL: "Általános",
  CONTRACT: "Szerződés",
  INVOICE: "Számla",
  RECEIPT: "Nyugta / bizonylat",
  QUOTE: "Ajánlat",
  PROJECT_FILE: "Projektfájl",
  OTHER: "Egyéb",
});

export const legacyDocumentTypeMap = Object.freeze({
  "ÁLTALÁNOS": "GENERAL",
  "SZERZŐDÉS": "CONTRACT",
  "MŰSZAKI DOKUMENTUM": "PROJECT_FILE",
  "PÉNZÜGYI DOKUMENTUM": "INVOICE",
  "SZÁMLA": "INVOICE",
  "NYUGTA": "RECEIPT",
  "NYUGTA / BIZONYLAT": "RECEIPT",
  "AJÁNLAT": "QUOTE",
  "PROJEKTFÁJL": "PROJECT_FILE",
  "EGYÉB": "OTHER",
});

export function normalizeDocumentType(value) {
  if (!value) return "GENERAL";
  const upper = String(value).trim().toUpperCase();
  if (documentTypeLabels[upper]) return upper;
  if (legacyDocumentTypeMap[upper]) return legacyDocumentTypeMap[upper];
  return "GENERAL";
}

export function getDocumentTypeLabel(type) {
  if (!type) return "Általános";
  const normalized = normalizeDocumentType(type);
  return documentTypeLabels[normalized] || type;
}

export const documentTypeOptions = Object.entries(documentTypeLabels).map(([value, label]) => ({ value, label }));

export function formatFileSize(bytes) {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / (1024 ** index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}
