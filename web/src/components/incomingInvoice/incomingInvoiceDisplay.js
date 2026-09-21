import Decimal from "decimal.js";

export const incomingInvoiceStatusLabels = Object.freeze({ DRAFT: "Piszkozat", RECEIVED: "Beérkezett", APPROVED: "Jóváhagyott", PAID: "Fizetve", REJECTED: "Elutasított" });
export const incomingInvoiceStatusClasses = Object.freeze({
  DRAFT: "border-[#dbe1df] bg-[#f5f7f6] text-[#657276]",
  RECEIVED: "border-[#cbdcf1] bg-[#eef5fc] text-[#41698f]",
  APPROVED: "border-[#cce4cf] bg-[#eff8ef] text-[#3c7547]",
  PAID: "border-[#b9ddd0] bg-[#e9f7f1] text-[#25634d]",
  REJECTED: "border-[#ebcbc5] bg-[#fdf1ee] text-[#9a4335]",
});
export const invoiceTransitions = Object.freeze({ DRAFT: ["RECEIVED"], RECEIVED: ["APPROVED", "REJECTED"], APPROVED: ["PAID"], PAID: [], REJECTED: [] });

export function calculateGross(netAmount, vatAmount) {
  try { return new Decimal(netAmount || 0).add(new Decimal(vatAmount || 0)).toDecimalPlaces(2).toFixed(2); } catch { return "0.00"; }
}
export function amountsMatch(netAmount, vatAmount, grossAmount) {
  try { return new Decimal(netAmount).add(new Decimal(vatAmount)).equals(new Decimal(grossAmount)); } catch { return false; }
}
export function formatInvoiceMoney(value, currency = "HUF") {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  return new Intl.NumberFormat("hu-HU", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
}
export function formatInvoiceDate(value) {
  return value ? new Intl.DateTimeFormat("hu-HU", { timeZone: "UTC" }).format(new Date(value)) : "—";
}
export const dateInputValue = (value) => value ? String(value).slice(0, 10) : "";

export function buildIncomingInvoiceParams(filters) {
  return {
    ...(filters.query?.trim() && { q: filters.query.trim() }),
    ...(filters.status && filters.status !== "ALL" && { status: filters.status }),
    ...(filters.currency && filters.currency !== "ALL" && { currency: filters.currency }),
    ...(filters.supplierPartnerId && { supplierPartnerId: filters.supplierPartnerId }),
    ...(filters.projectId && { projectId: filters.projectId }),
    ...(filters.dueFrom && { dueFrom: filters.dueFrom }), ...(filters.dueTo && { dueTo: filters.dueTo }),
    ...(filters.issueFrom && { issueFrom: filters.issueFrom }), ...(filters.issueTo && { issueTo: filters.issueTo }),
    sortBy: filters.sortBy, sortDirection: filters.sortDirection,
  };
}

export function validateIncomingInvoiceForm({ supplierPartnerId, invoiceNumber, netAmount, vatAmount, grossAmount }) {
  if (!supplierPartnerId) return "Szállító kiválasztása kötelező.";
  if (!invoiceNumber?.trim()) return "A számlaszám kötelező.";
  if (![netAmount, vatAmount, grossAmount].every((value) => value !== "" && Number(value) >= 0)) return "Az összegek nem lehetnek negatívak.";
  if (!amountsMatch(netAmount, vatAmount, grossAmount)) return "A nettó és ÁFA összegének meg kell egyeznie a bruttó összeggel.";
  return "";
}
