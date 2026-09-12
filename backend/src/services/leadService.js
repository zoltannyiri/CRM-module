import prisma from "../lib/prisma.js";
import activityService from "./activityService.js";

const memberSelect = { id: true, user: { select: { firstName: true, lastName: true } } };
const leadSelect = {
  id: true, name: true, companyName: true, email: true, phone: true, status: true,
  source: true, note: true, assignedMemberId: true, createdAt: true, updatedAt: true,
  assignedMember: { select: memberSelect },
  createdByMember: { select: { user: { select: { firstName: true, lastName: true } } } },
};

export async function getLeads({ organizationId, status, source, assignedMemberId, search = "", sortDirection = "desc" }, client = prisma) {
  const term = search.trim();
  return client.lead.findMany({
    where: {
      organizationId,
      ...(status !== undefined && { status }),
      ...(source !== undefined && { source }),
      ...(assignedMemberId !== undefined && { assignedMemberId }),
      ...(term && { OR: ["name", "companyName", "email", "phone"].map((field) => ({ [field]: { contains: term, mode: "insensitive" } })) }),
    },
    select: leadSelect,
    orderBy: { id: sortDirection },
  });
}

export async function getLeadById({ organizationId, leadId }, client = prisma) {
  return client.lead.findFirst({ where: { id: leadId, organizationId }, select: leadSelect });
}

async function validMember(organizationId, memberId, tx) {
  if (memberId === null || memberId === undefined) return true;
  return tx.organizationMember.findFirst({ where: { id: memberId, organizationId }, select: { id: true } });
}

function log(tx, args, lead, action, title, metadata = null) {
  return activityService.createActivity({
    organizationId: args.organizationId, actorMemberId: args.actorMemberId,
    entityType: "LEAD", entityId: lead.id, action, title, description: lead.name, metadata,
  }, tx);
}

export async function createLead(args, client = prisma) {
  return client.$transaction(async (tx) => {
    if (!(await validMember(args.organizationId, args.data.assignedMemberId, tx))) return null;
    if (!(await validMember(args.organizationId, args.actorMemberId, tx))) return null;
    const lead = await tx.lead.create({ data: { ...args.data, organizationId: args.organizationId, createdByMemberId: args.actorMemberId || null }, select: leadSelect });
    await log(tx, args, lead, "CREATED", "Érdeklődő létrehozva");
    if (lead.assignedMemberId !== null) await log(tx, args, lead, "ASSIGNED", "Érdeklődő felelőse megváltozott", { oldAssigneeMemberId: null, newAssigneeMemberId: lead.assignedMemberId });
    return lead;
  });
}

export async function updateLead(args, client = prisma) {
  return client.$transaction(async (tx) => {
    // Transaction-scoped lock serializes assignment/status events for this tenant and lead.
    await tx.$queryRaw`SELECT true AS locked FROM pg_advisory_xact_lock(${args.organizationId}::integer, ${args.leadId}::integer)`;
    const existing = await getLeadById(args, tx);
    if (!existing) return null;
    if (!(await validMember(args.organizationId, args.data.assignedMemberId, tx))) return null;
    const changedFields = Object.keys(args.data).filter((key) => args.data[key] !== existing[key]);
    if (!changedFields.length) return existing;
    const lead = await tx.lead.update({ where: { id: args.leadId, organizationId: args.organizationId }, data: args.data, select: leadSelect });
    if (changedFields.includes("status")) await log(tx, args, lead, "STATUS_CHANGED", "Érdeklődő státusza megváltozott", { field: "status", oldValue: existing.status, newValue: lead.status });
    if (changedFields.includes("assignedMemberId")) await log(tx, args, lead, "ASSIGNED", "Érdeklődő felelőse megváltozott", {
      oldAssigneeMemberId: existing.assignedMemberId, newAssigneeMemberId: lead.assignedMemberId,
      oldAssigneeName: existing.assignedMember ? [existing.assignedMember.user.firstName, existing.assignedMember.user.lastName].join(" ") : null,
      newAssigneeName: lead.assignedMember ? [lead.assignedMember.user.firstName, lead.assignedMember.user.lastName].join(" ") : null,
    });
    const otherFields = changedFields.filter((key) => !["status", "assignedMemberId"].includes(key));
    if (otherFields.length) await log(tx, args, lead, "UPDATED", "Érdeklődő módosítva", { changedFields: otherFields });
    return lead;
  });
}

export async function deleteLead(args, client = prisma) {
  return client.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT true AS locked FROM pg_advisory_xact_lock(${args.organizationId}::integer, ${args.leadId}::integer)`;
    const lead = await getLeadById(args, tx);
    if (!lead) return false;
    const result = await tx.lead.deleteMany({ where: { id: args.leadId, organizationId: args.organizationId } });
    if (result.count !== 1) return false;
    await log(tx, args, lead, "DELETED", "Érdeklődő törölve");
    return true;
  });
}

export default { getLeads, getLeadById, createLead, updateLead, deleteLead };
