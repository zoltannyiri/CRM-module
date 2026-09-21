import { Prisma } from "@prisma/client";

export const INCOMING_INVOICE_STATUSES = Object.freeze(["DRAFT", "RECEIVED", "APPROVED", "PAID", "REJECTED"]);
export const INCOMING_INVOICE_CURRENCIES = Object.freeze(["HUF", "EUR", "USD"]);
export const INCOMING_INVOICE_TRANSITIONS = Object.freeze({
  DRAFT: ["RECEIVED"],
  RECEIVED: ["APPROVED", "REJECTED"],
  APPROVED: ["PAID"],
  PAID: [],
  REJECTED: [],
});

const editableFields = new Set([
  "supplierPartnerId", "projectId", "invoiceNumber", "issueDate", "performanceDate",
  "dueDate", "currency", "netAmount", "vatAmount", "grossAmount", "status", "note",
]);

function positiveId(value) {
  if (typeof value !== "number" && (typeof value !== "string" || !/^[1-9]\d*$/.test(value))) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function parseDateOnly(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
}

function money(value, label) {
  if (value === null || value === undefined || value === "") return { error: `A(z) ${label} kitöltése kötelező.` };
  try {
    const amount = new Prisma.Decimal(value);
    if (!amount.isFinite() || amount.lt(0)) return { error: `A(z) ${label} nem lehet negatív.` };
    if (amount.decimalPlaces() > 2 || amount.gte("10000000000000000")) return { error: `A(z) ${label} legfeljebb 2 tizedesjegyet tartalmazhat.` };
    return { value: amount };
  } catch {
    return { error: `A(z) ${label} érvénytelen szám.` };
  }
}

export function normalizeIncomingInvoicePayload(body, { partial = false } = {}) {
  const source = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  const unknown = Object.keys(source).filter((key) => !editableFields.has(key));
  if (unknown.length) return { error: `Ismeretlen mező: ${unknown[0]}` };
  const has = (key) => Object.hasOwn(source, key);
  const data = {};

  if (!partial || has("supplierPartnerId")) {
    const id = positiveId(source.supplierPartnerId);
    if (!id) return { error: "Szállító kiválasztása kötelező." };
    data.supplierPartnerId = id;
  }
  if (!partial || has("projectId")) {
    if (source.projectId === null || source.projectId === "" || source.projectId === undefined) data.projectId = null;
    else {
      const id = positiveId(source.projectId);
      if (!id) return { error: "Érvénytelen projektazonosító." };
      data.projectId = id;
    }
  }
  if (!partial || has("invoiceNumber")) {
    const value = typeof source.invoiceNumber === "string" ? source.invoiceNumber.trim() : "";
    if (!value || value.length > 120) return { error: "A számlaszám kötelező és legfeljebb 120 karakter lehet." };
    data.invoiceNumber = value;
  }
  for (const field of ["issueDate", "performanceDate", "dueDate"]) {
    if (!partial || has(field)) {
      if (field !== "issueDate" && (source[field] === null || source[field] === "" || source[field] === undefined)) data[field] = null;
      else {
        const date = parseDateOnly(source[field]);
        if (!date) return { error: "A dátumokat valós ÉÉÉÉ-HH-NN formátumban add meg." };
        data[field] = date;
      }
    }
  }
  if (!partial || has("currency")) {
    const value = typeof source.currency === "string" ? source.currency.trim().toUpperCase() : "";
    if (!INCOMING_INVOICE_CURRENCIES.includes(value)) return { error: "A pénznem HUF, EUR vagy USD lehet." };
    data.currency = value;
  }
  for (const [field, label] of [["netAmount", "nettó összeg"], ["vatAmount", "ÁFA összeg"], ["grossAmount", "bruttó összeg"]]) {
    if (!partial || has(field)) {
      const result = money(source[field], label);
      if (result.error) return { error: result.error };
      data[field] = result.value;
    }
  }
  if (!partial || has("status")) {
    const value = !partial && !has("status") ? "DRAFT" : source.status;
    if (!INCOMING_INVOICE_STATUSES.includes(value)) return { error: "Érvénytelen számlastátusz." };
    if (!partial && value !== "DRAFT") return { error: "Új számla csak PISZKOZAT státusszal hozható létre." };
    data.status = value;
  }
  if (!partial || has("note")) {
    if (source.note !== undefined && source.note !== null && typeof source.note !== "string") return { error: "A megjegyzés szöveg vagy null lehet." };
    data.note = typeof source.note === "string" && source.note.trim() ? source.note.trim() : null;
  }
  if (!partial || ["netAmount", "vatAmount", "grossAmount"].every((field) => has(field))) {
    if (!data.netAmount.add(data.vatAmount).equals(data.grossAmount)) return { error: "A nettó és ÁFA összegének meg kell egyeznie a bruttó összeggel." };
  }
  return { data };
}

export function parsePositiveId(value) {
  return positiveId(value);
}
