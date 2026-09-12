import Decimal from "decimal.js";

const OfferDecimal = Decimal.clone({ precision: 50, rounding: Decimal.ROUND_HALF_UP });

export const offerStatusLabels = {
  DRAFT: "Piszkozat",
  SENT: "Elküldve",
  ACCEPTED: "Elfogadva",
  REJECTED: "Elutasítva",
  EXPIRED: "Lejárt",
  CANCELLED: "Visszavonva",
};

export const offerStatusClasses = {
  DRAFT: "border-[#d9e0df] bg-[#f3f5f5] text-[#5f6c70]",
  SENT: "border-[#c5d8e8] bg-[#edf4fa] text-[#3d6b8e]",
  ACCEPTED: "border-[#cfe3d1] bg-[#eff7ef] text-[#4d7853]",
  REJECTED: "border-[#ead6d1] bg-[#faf1ef] text-[#8a5b51]",
  EXPIRED: "border-[#e8ddc5] bg-[#faf6ec] text-[#816d40]",
  CANCELLED: "border-[#d9e0df] bg-[#f3f5f5] text-[#5f6c70]",
};

export function formatOfferDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("hu-HU", { timeZone: "UTC" }).format(new Date(value));
}

export function formatMoney(value, currency = "HUF") {
  const amount = Number(value || 0);
  try {
    return new Intl.NumberFormat("hu-HU", {
      style: "currency",
      currency,
      minimumFractionDigits: currency === "HUF" ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export function calculateDraftTotals(items) {
  const safeDecimal = (value) => {
    try {
      const amount = new OfferDecimal(value || 0);
      return amount.isFinite() ? amount : new OfferDecimal(0);
    } catch { return new OfferDecimal(0); }
  };
  let net = new OfferDecimal(0);
  let vat = new OfferDecimal(0);
  for (const item of items) {
    const itemNet = safeDecimal(item.quantity).mul(safeDecimal(item.unitPrice)).toDecimalPlaces(2);
    const itemVat = itemNet.mul(safeDecimal(item.vatRate)).div(100).toDecimalPlaces(2);
    net = net.add(itemNet);
    vat = vat.add(itemVat);
  }
  return { net: net.toFixed(2), vat: vat.toFixed(2), gross: net.add(vat).toFixed(2) };
}
