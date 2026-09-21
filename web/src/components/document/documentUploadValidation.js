export const MAX_DOCUMENT_FILE_SIZE = 20 * 1024 * 1024;
export const ACCEPTED_DOCUMENT_TYPES = Object.freeze([
  "application/pdf", "image/jpeg", "image/png", "image/webp", "text/csv", "text/plain",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

const extensionsByMime = Object.freeze({
  "application/pdf": ["pdf"], "image/jpeg": ["jpg", "jpeg"], "image/png": ["png"], "image/webp": ["webp"],
  "text/csv": ["csv"], "text/plain": ["txt"], "application/msword": ["doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["docx"],
  "application/vnd.ms-excel": ["xls"], "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ["xlsx"],
});

export function validateDocumentFile(file) {
  if (!file) return "Válassz fájlt.";
  if (file.size > MAX_DOCUMENT_FILE_SIZE) return "A fájl legfeljebb 20 MB lehet.";
  if (!ACCEPTED_DOCUMENT_TYPES.includes(file.type)) return "Ez a fájltípus nem támogatott.";
  const extension = String(file.name || "").split(".").pop()?.toLowerCase();
  if (!extension || !extensionsByMime[file.type]?.includes(extension)) return "A fájl kiterjesztése és típusa nem egyezik.";
  return "";
}
