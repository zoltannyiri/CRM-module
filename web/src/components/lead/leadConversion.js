export const emptyPartnerConversion = Object.freeze({
  type: "COMPANY", name: "", email: "", phone: "", website: "", taxNumber: "", address: "", note: "",
});

export function partnerPrefillFromLead(lead = {}) {
  const companyName = typeof lead.companyName === "string" ? lead.companyName.trim() : "";
  return {
    ...emptyPartnerConversion,
    type: companyName ? "COMPANY" : "PERSON",
    name: companyName || (typeof lead.name === "string" ? lead.name.trim() : ""),
    email: typeof lead.email === "string" ? lead.email : "",
    phone: typeof lead.phone === "string" ? lead.phone : "",
  };
}

export function canConvertLead({ lead, hasModule, hasPermission }) {
  return Boolean(lead && !lead.convertedAt && hasModule("LEADS") && hasModule("PARTNERS") &&
    hasPermission("LEADS_CONVERT") && hasPermission("PARTNERS_CREATE"));
}

export function conversionDestination(result, canViewPartner) {
  return canViewPartner && result?.partner?.id ? `/partner/${result.partner.id}` : null;
}
