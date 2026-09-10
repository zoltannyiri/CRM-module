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
  return items.reduce((totals, item) => {
    const net = (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
    const vat = net * (Number(item.vatRate) || 0) / 100;
    totals.net += net;
    totals.vat += vat;
    totals.gross += net + vat;
    return totals;
  }, { net: 0, vat: 0, gross: 0 });
}
