import service from "../services/followUpService.js";
import { parseId } from "./pipelineController.js";

const id = (value) => typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 2147483647;
const types = new Set(["CALL", "EMAIL", "MEETING", "OTHER"]);
const statuses = new Set(["OPEN", "COMPLETED", "CANCELLED"]);
export function parseTimestamp(value) {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, m, d, h, min, sec, , zone] = match;
  const year = Number(y), month = Number(m), day = Number(d);
  if (year < 1000 || month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate() || Number(h) > 23 || Number(min) > 59 || Number(sec) > 59) return null;
  if (zone !== "Z") {
    const hours = Number(zone.slice(1, 3)), minutes = Number(zone.slice(4));
    if (hours > 14 || minutes > 59 || (hours === 14 && minutes !== 0)) return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) || date.getUTCFullYear() < 1000 || date.getUTCFullYear() > 9999 ? null : date;
}
export function normalizeFollowUp(body, partial = false) {
  const allowed = partial ? ["type", "dueAt", "assignedMemberId", "note", "status"] : ["leadId", "type", "dueAt", "assignedMemberId", "note"];
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some((field) => !allowed.includes(field))) return { error: "Ismeretlen vagy érvénytelen utánkövetés mező." };
  const data = {};
  if (!partial) {
    if (!id(body.leadId)) return { error: "Érvénytelen érdeklődő azonosító." };
    data.leadId = body.leadId;
  }
  if (!partial || Object.hasOwn(body, "type")) {
    if (!types.has(body.type)) return { error: "Érvénytelen utánkövetés típus." };
    data.type = body.type;
  }
  if (!partial || Object.hasOwn(body, "dueAt")) {
    const dueAt = parseTimestamp(body.dueAt);
    if (!dueAt) return { error: "Adj meg érvényes, időzónát is tartalmazó időpontot." };
    data.dueAt = dueAt;
  }
  if (Object.hasOwn(body, "assignedMemberId")) {
    if (body.assignedMemberId !== null && !id(body.assignedMemberId)) return { error: "Érvénytelen felelős." };
    data.assignedMemberId = body.assignedMemberId;
  }
  if (Object.hasOwn(body, "note")) {
    if (body.note !== null && (typeof body.note !== "string" || body.note.length > 10000 || body.note.includes("\0"))) return { error: "A megjegyzés legfeljebb 10000 karakter lehet." };
    data.note = body.note?.trim() || null;
  }
  if (Object.hasOwn(body, "status")) {
    if (!["OPEN", "CANCELLED"].includes(body.status)) return { error: "Teljesítéshez használd a külön Teljesítve műveletet." };
    data.status = body.status;
  }
  return { data };
}
export function normalizeFilters(query) {
  const data = {};
  for (const field of ["leadId", "assignedMemberId"]) if (query[field] !== undefined) {
    data[field] = parseId(query[field]); if (!data[field]) return { error: "Érvénytelen szűrő azonosító." };
  }
  for (const [field, values] of [["type", types], ["status", statuses], ["period", new Set(["ALL", "OVERDUE", "TODAY", "UPCOMING", "COMPLETED"])], ["sort", new Set(["dueAsc", "dueDesc", "completedDesc"])]]) {
    if (query[field] !== undefined) { if (!values.has(query[field])) return { error: "Érvénytelen szűrő vagy rendezés." }; data[field] = query[field]; }
  }
  if (query.search !== undefined) {
    if (typeof query.search !== "string" || query.search.length > 200 || query.search.includes("\0")) return { error: "Érvénytelen keresés." };
    data.search = query.search;
  }
  if (query.timeZone !== undefined) {
    if (typeof query.timeZone !== "string" || query.timeZone.length > 100 || !/^[A-Za-z_+-]+(?:\/[A-Za-z0-9_+-]+)*$/.test(query.timeZone)) return { error: "Érvénytelen időzóna." };
    try { data.timeZone = new Intl.DateTimeFormat("en", { timeZone: query.timeZone }).resolvedOptions().timeZone; }
    catch { return { error: "Érvénytelen időzóna." }; }
  }
  return { data };
}
const action = (operation) => async (req, res, next) => {
  try {
    const args = { organizationId: req.organization.id, actorMemberId: req.membership.id };
    if (req.params.id !== undefined) { args.followUpId = parseId(req.params.id); if (!args.followUpId) return res.status(400).json({ message: "Érvénytelen azonosító." }); }
    let result;
    if (operation === "list") {
      const normalized = normalizeFilters(req.query);
      if (normalized.error) return res.status(400).json({ message: normalized.error });
      result = await service.getFollowUps({ ...args, ...normalized.data });
    } else if (operation === "create" || operation === "edit") {
      const normalized = normalizeFollowUp(req.body, operation === "edit");
      if (normalized.error) return res.status(400).json({ message: normalized.error });
      result = await service[operation === "create" ? "createFollowUp" : "updateFollowUp"]({ ...args, data: normalized.data });
    } else if (operation === "complete") {
      if (req.body !== undefined && (!req.body || typeof req.body !== "object" || Array.isArray(req.body) || Object.keys(req.body).length)) return res.status(400).json({ message: "A teljesítés nem fogad módosítható mezőket." });
      result = await service.completeFollowUp(args);
    } else result = await service[operation === "show" ? "getFollowUp" : "deleteFollowUp"](args);
    if (!result) return res.status(404).json({ message: "Utánkövetés nem található." });
    return res.status(operation === "create" ? 201 : 200).json(result);
  } catch (error) {
    if (["P2003", "P2025"].includes(error.code)) return res.status(404).json({ message: "Utánkövetés, érdeklődő vagy szervezeti tag nem található." });
    return next(error);
  }
};
export default { list: action("list"), show: action("show"), create: action("create"), edit: action("edit"), complete: action("complete"), delete: action("delete") };
