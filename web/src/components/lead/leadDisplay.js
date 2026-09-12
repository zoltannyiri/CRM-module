export const leadStatusLabels = { NEW: "Új", CONTACTED: "Kapcsolatfelvétel megtörtént", QUALIFIED: "Minősített", LOST: "Elveszett" };
export const leadSourceLabels = { WEBSITE: "Weboldal", REFERRAL: "Ajánlás", PHONE: "Telefon", EMAIL: "E-mail", SOCIAL: "Közösségi média", OTHER: "Egyéb" };
export const leadStatusClasses = {
  NEW: "border-[#d8e2e6] bg-[#f0f4f7] text-[#446574]",
  CONTACTED: "border-[#e8ddc5] bg-[#faf6ec] text-[#816d40]",
  QUALIFIED: "border-[#cfe3d1] bg-[#eff7ef] text-[#4d7853]",
  LOST: "border-[#ead6d1] bg-[#faf1ef] text-[#8a5b51]",
};
export function memberName(member) {
  return member?.user ? [member.user.firstName, member.user.lastName].filter(Boolean).join(" ") || "—" : "—";
}
export function formatLeadDate(value) {
  return value ? new Date(value).toLocaleDateString("hu-HU") : "—";
}
