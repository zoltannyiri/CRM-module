import prisma from "../lib/prisma.js";
import activityService from "./activityService.js";

export const followUpSelect = {
  id: true, leadId: true, type: true, status: true, dueAt: true, note: true,
  assignedMemberId: true, completedAt: true, createdAt: true, updatedAt: true,
  lead: { select: { id: true, name: true, companyName: true } },
  assignedMember: { select: { id: true, user: { select: { firstName: true, lastName: true } } } },
};
export class FollowUpError extends Error {
  constructor(message, statusCode = 404) { super(message); this.statusCode = statusCode; }
}
const missing = () => new FollowUpError("Utánkövetés, érdeklődő vagy szervezeti tag nem található.");

export function canViewFollowUps({ enabledModules = [], permissions = [] } = {}) {
  return ["FOLLOW_UPS", "LEADS"].every((key) => enabledModules.includes(key)) &&
    ["FOLLOW_UPS_VIEW", "LEADS_VIEW"].every((key) => permissions.includes(key));
}

// PostgreSQL converts both local midnights independently: DST days are not
// assumed to be 24 hours. Default is the application's Hungarian business zone.
export async function getDayRange(timeZone = "Europe/Budapest", now = new Date(), client = prisma) {
  const [range] = await client.$queryRaw`SELECT
    (date_trunc('day', ${now}::timestamptz AT TIME ZONE ${timeZone}) AT TIME ZONE ${timeZone}) AS start,
    ((date_trunc('day', ${now}::timestamptz AT TIME ZONE ${timeZone}) + interval '1 day') AT TIME ZONE ${timeZone}) AS "end"`;
  return range;
}

export function listWhere(args, now, dayRange) {
  const conditions = [];
  if (args.status) conditions.push({ status: args.status });
  if (args.period === "OVERDUE") conditions.push({ status: "OPEN", dueAt: { lt: now } });
  if (args.period === "TODAY") conditions.push({ status: "OPEN", dueAt: { gte: dayRange.start, lt: dayRange.end } });
  if (args.period === "UPCOMING") conditions.push({ status: "OPEN", dueAt: { gt: now } });
  if (args.period === "COMPLETED") conditions.push({ status: "COMPLETED" });
  if (args.search?.trim()) conditions.push({ OR: [
    { note: { contains: args.search.trim(), mode: "insensitive" } },
    { lead: { name: { contains: args.search.trim(), mode: "insensitive" } } },
    { lead: { companyName: { contains: args.search.trim(), mode: "insensitive" } } },
  ] });
  return { organizationId: args.organizationId,
    ...(args.leadId !== undefined && { leadId: args.leadId }),
    ...(args.assignedMemberId !== undefined && { assignedMemberId: args.assignedMemberId }),
    ...(args.type && { type: args.type }), ...(conditions.length && { AND: conditions }),
  };
}
export async function getFollowUps(args, client = prisma) {
  const now = args.now || new Date();
  const dayRange = args.period === "TODAY" ? await getDayRange(args.timeZone, now, client) : undefined;
  const completed = args.sort === "completedDesc" || (!args.sort && args.period === "COMPLETED");
  return client.followUp.findMany({ where: listWhere(args, now, dayRange), select: followUpSelect,
    orderBy: completed ? [{ completedAt: { sort: "desc", nulls: "last" } }, { id: "desc" }]
      : [{ dueAt: args.sort === "dueDesc" ? "desc" : "asc" }, { id: "asc" }],
  });
}
export function getFollowUp(args, client = prisma) {
  return client.followUp.findFirst({ where: { id: args.followUpId, organizationId: args.organizationId }, select: followUpSelect });
}
async function validMember(id, organizationId, tx) {
  return id == null || Boolean(await tx.organizationMember.findFirst({ where: { id, organizationId }, select: { id: true } }));
}
function log(args, record, action, tx, metadata = null) {
  const titles = { CREATED: "Utánkövetés létrehozva", UPDATED: "Utánkövetés módosítva", DELETED: "Utánkövetés törölve", FOLLOW_UP_COMPLETED: "Utánkövetés teljesítve" };
  return activityService.createActivity({ organizationId: args.organizationId, actorMemberId: args.actorMemberId,
    entityType: "FOLLOW_UP", entityId: record.id, action, title: titles[action], description: record.lead.name, metadata }, tx);
}
export async function createFollowUp(args, client = prisma) {
  return client.$transaction(async (tx) => {
    // Share the existing Lead delete lock while creating its child.
    await tx.$queryRaw`SELECT true AS locked FROM pg_advisory_xact_lock(${args.organizationId}::integer, ${args.data.leadId}::integer)`;
    if (!await tx.lead.findFirst({ where: { id: args.data.leadId, organizationId: args.organizationId }, select: { id: true } }) ||
      !await validMember(args.data.assignedMemberId, args.organizationId, tx) || !await validMember(args.actorMemberId, args.organizationId, tx)) throw missing();
    const record = await tx.followUp.create({ data: { ...args.data, organizationId: args.organizationId, createdByMemberId: args.actorMemberId, status: "OPEN" }, select: followUpSelect });
    await log(args, record, "CREATED", tx);
    return record;
  });
}
async function mutate(args, client, kind) {
  return client.$transaction(async (tx) => {
    // -1 is reserved for Pipeline org locks; positive keys belong to Leads.
    const key = -args.followUpId - 1;
    await tx.$queryRaw`SELECT true AS locked FROM pg_advisory_xact_lock(${args.organizationId}::integer, ${key}::integer)`;
    const existing = await getFollowUp(args, tx);
    if (!existing) throw missing();
    if (kind === "delete") {
      await tx.followUp.delete({ where: { id: args.followUpId, organizationId: args.organizationId } });
      await log(args, existing, "DELETED", tx); return { message: "Utánkövetés törölve." };
    }
    let data;
    if (kind === "complete") {
      if (existing.status === "COMPLETED") return existing;
      if (existing.status !== "OPEN") throw new FollowUpError("Csak nyitott utánkövetés teljesíthető.", 409);
      data = { status: "COMPLETED", completedAt: new Date() };
    } else {
      if (!await validMember(args.data.assignedMemberId, args.organizationId, tx)) throw missing();
      data = { ...args.data };
      if (data.status !== undefined && data.status !== "COMPLETED") data.completedAt = null;
    }
    const changedFields = Object.keys(data).filter((field) => data[field] instanceof Date
      ? data[field].getTime() !== existing[field]?.getTime() : data[field] !== existing[field]);
    if (!changedFields.length) return existing;
    const record = await tx.followUp.update({ where: { id: args.followUpId, organizationId: args.organizationId }, data, select: followUpSelect });
    await log(args, record, kind === "complete" ? "FOLLOW_UP_COMPLETED" : "UPDATED", tx,
      kind === "complete" ? null : { changedFields: changedFields.filter((field) => field !== "completedAt") });
    return record;
  });
}
export const updateFollowUp = (args, client = prisma) => mutate(args, client, "edit");
export const completeFollowUp = (args, client = prisma) => mutate(args, client, "complete");
export const deleteFollowUp = (args, client = prisma) => mutate(args, client, "delete");

export async function getMyFollowUpsSummary({ organizationId, memberId, timeZone, now = new Date() }, client = prisma) {
  const day = await getDayRange(timeZone, now, client);
  const where = { organizationId, assignedMemberId: memberId, status: "OPEN" };
  const [overdue, today, items] = await Promise.all([
    client.followUp.count({ where: { ...where, dueAt: { lt: now } } }),
    client.followUp.count({ where: { ...where, dueAt: { gte: day.start, lt: day.end } } }),
    client.followUp.findMany({ where, select: followUpSelect, orderBy: [{ dueAt: "asc" }, { id: "asc" }], take: 5 }),
  ]);
  return { overdue, today, items };
}
export default { getFollowUps, getFollowUp, createFollowUp, updateFollowUp, completeFollowUp, deleteFollowUp };
