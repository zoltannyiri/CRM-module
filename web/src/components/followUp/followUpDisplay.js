export const followUpTypeLabels = { CALL: "Telefon", EMAIL: "E-mail", MEETING: "Találkozó", OTHER: "Egyéb" };
export const followUpStatusLabels = { OPEN: "Nyitott", COMPLETED: "Teljesítve", CANCELLED: "Lemondva" };
export const followUpPeriods = { ALL: "Összes", OVERDUE: "Lejárt", TODAY: "Ma", UPCOMING: "Közelgő", COMPLETED: "Teljesített" };
export const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Budapest";
export function followUpAccess(hasModule, hasPermission) {
  const view = hasModule("FOLLOW_UPS") && hasModule("LEADS") && hasPermission("FOLLOW_UPS_VIEW") && hasPermission("LEADS_VIEW");
  return { view, create: view && hasPermission("FOLLOW_UPS_CREATE"), edit: view && hasPermission("FOLLOW_UPS_EDIT"), delete: view && hasPermission("FOLLOW_UPS_DELETE"), complete: view && hasPermission("FOLLOW_UPS_COMPLETE") };
}
export function formatFollowUpTime(value) {
  const date = new Date(value);
  return value && !Number.isNaN(date.getTime()) ? new Intl.DateTimeFormat("hu-HU", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date) : "—";
}
export const isFollowUpOverdue = (item, now = new Date()) => item.status === "OPEN" && new Date(item.dueAt).getTime() < now.getTime();
export function toLocalDateTime(value) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return "";
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
export function toApiTimestamp(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, m, d, h, min] = match.map(Number);
  if (y < 1000 || y > 9999) return null;
  const date = new Date(y, m - 1, d, h, min);
  // Reject normalized impossible dates and the nonexistent DST spring hour.
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d || date.getHours() !== h || date.getMinutes() !== min) return null;
  // During the autumn repeated hour JS selects its first occurrence. Existing
  // untouched timestamps are preserved by the form, including the second one.
  return date.toISOString();
}
export function followUpQuery({ query = "", period = "ALL", type = "", status = "", assignedMemberId = "", leadId, sort = "" } = {}) {
  return { ...(query.trim() && { search: query.trim() }), period,
    ...(type && { type }), ...(status && { status }), ...(assignedMemberId && { assignedMemberId }),
    ...(leadId && { leadId }), ...(sort && { sort }), timeZone: browserTimeZone(),
  };
}
