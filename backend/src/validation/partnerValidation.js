const PARTNER_TYPES = new Set(["COMPANY", "PERSON"]);
const ALLOWED_FIELDS = new Set(["type", "name", "email", "phone", "website", "taxNumber", "address", "note", "customFieldValues"]);
const OPTIONAL_LIMITS = Object.freeze({
  email: 254,
  phone: 50,
  website: 2048,
  taxNumber: 100,
  address: 1000,
  note: 10000,
});

export function normalizePartnerPayload(body, { partial = false } = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "Érvénytelen partner adatok." };
  if (Object.keys(body).some((key) => !ALLOWED_FIELDS.has(key))) return { error: "Ismeretlen vagy nem módosítható partner mező." };

  const data = {};
  if (!partial || Object.hasOwn(body, "name")) {
    if (typeof body.name !== "string" || !body.name.trim() || body.name.includes("\0") || body.name.trim().length > 200) {
      return { error: "A partner neve kötelező, legfeljebb 200 karakter." };
    }
    data.name = body.name.trim();
  }

  if (Object.hasOwn(body, "type")) {
    if (!PARTNER_TYPES.has(body.type)) return { error: "Érvénytelen partner típus." };
    data.type = body.type;
  } else if (!partial) data.type = "COMPANY";

  for (const [field, maxLength] of Object.entries(OPTIONAL_LIMITS)) {
    if (!Object.hasOwn(body, field)) continue;
    if (body[field] !== null && typeof body[field] !== "string") return { error: `Érvénytelen ${field} mező.` };
    if (typeof body[field] === "string" && body[field].includes("\0")) return { error: `Érvénytelen ${field} mező.` };
    const value = body[field]?.trim() || null;
    if (value && value.length > maxLength) return { error: `A ${field} mező legfeljebb ${maxLength} karakter lehet.` };
    if (field === "email" && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return { error: "Érvénytelen e-mail cím." };
    if (field === "phone" && value && (!/^\+?[\d\s().-]+$/.test(value) || value.replace(/\D/g, "").length < 6 || value.replace(/\D/g, "").length > 15)) return { error: "Érvénytelen telefonszám." };
    data[field] = value;
  }
  if (Object.hasOwn(body, "customFieldValues")) {
    if (body.customFieldValues !== null && !Array.isArray(body.customFieldValues)) {
      return { error: "A customFieldValues mezőnek tömbnek kell lennie." };
    }
    data.customFieldValues = body.customFieldValues;
  }
  return { data };
}

export default normalizePartnerPayload;
