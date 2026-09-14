import prisma from "../lib/prisma.js";
import activityService from "./activityService.js";
import { DEFAULT_PIPELINE_STAGES, lockPipelineOrganization } from "./pipelineInitializationService.js";

const stageSelect = { id: true, name: true, position: true };
const pipelineSelect = {
  id: true, name: true, isDefault: true, createdAt: true, updatedAt: true,
  stages: { select: stageSelect, orderBy: [{ position: "asc" }, { id: "asc" }] },
};
const cardSelect = {
  id: true, name: true, companyName: true, status: true, source: true,
  assignedMember: { select: { id: true, user: { select: { firstName: true, lastName: true } } } },
  pipelinePosition: { select: { pipelineStageId: true } },
};
export class PipelineError extends Error {
  constructor(message, statusCode = 409) { super(message); this.statusCode = statusCode; }
}
const missing = () => new PipelineError("Pipeline, szakasz vagy érdeklődő nem található.", 404);

export function getPipelines({ organizationId }, client = prisma) {
  return client.pipeline.findMany({ where: { organizationId }, select: pipelineSelect, orderBy: [{ isDefault: "desc" }, { id: "asc" }] });
}
export function getPipeline({ organizationId, pipelineId }, client = prisma) {
  return client.pipeline.findFirst({ where: { id: pipelineId, organizationId }, select: pipelineSelect });
}

export async function getBoard(args, client = prisma) {
  return client.$transaction(async (tx) => {
    const pipeline = await getPipeline(args, tx);
    if (!pipeline) throw missing();
    const search = args.search?.trim();
    const leads = await tx.lead.findMany({
      where: { organizationId: args.organizationId,
        AND: [
          { OR: [{ pipelinePosition: null }, { pipelinePosition: { pipelineId: args.pipelineId, organizationId: args.organizationId } }] },
          ...(search ? [{ OR: ["name", "companyName"].map((field) => ({ [field]: { contains: search, mode: "insensitive" } })) }] : []),
        ],
        ...(args.assignedMemberId !== undefined && { assignedMemberId: args.assignedMemberId }),
      },
      select: { ...cardSelect, ...(args.canViewFollowUps && { followUps: {
        where: { organizationId: args.organizationId, status: "OPEN" }, select: { dueAt: true },
        orderBy: [{ dueAt: "asc" }, { id: "asc" }], take: 1,
      } }) }, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    const stages = pipeline.stages.map((stage) => ({ ...stage, leads: [] }));
    const byId = new Map(stages.map((stage) => [stage.id, stage]));
    const unassignedLeads = [];
    for (const { pipelinePosition, followUps, ...lead } of leads) {
      if (args.canViewFollowUps) lead.nextFollowUp = followUps?.[0] || null;
      if (!pipelinePosition) unassignedLeads.push(lead);
      else byId.get(pipelinePosition.pipelineStageId)?.leads.push(lead);
    }
    const { stages: _stages, ...definition } = pipeline;
    return { pipeline: definition, stages, unassignedLeads };
  }, { isolationLevel: "RepeatableRead" });
}

async function setDefault(organizationId, tx) {
  await tx.pipeline.updateMany({ where: { organizationId, isDefault: true }, data: { isDefault: false } });
}
export async function createPipeline({ organizationId, data }, client = prisma) {
  return client.$transaction(async (tx) => {
    await lockPipelineOrganization(organizationId, tx);
    const first = !(await tx.pipeline.findFirst({ where: { organizationId }, select: { id: true } }));
    const isDefault = first || data.isDefault === true;
    if (isDefault) await setDefault(organizationId, tx);
    return tx.pipeline.create({ data: {
      organizationId, name: data.name, isDefault,
      stages: { create: (data.stages || DEFAULT_PIPELINE_STAGES.map((name) => ({ name }))).map((stage, index) => ({ name: stage.name, position: index + 1 })) },
    }, select: pipelineSelect });
  });
}

async function replaceStages(args, pipeline, tx) {
  const ids = args.data.stages.filter((stage) => stage.id !== undefined).map((stage) => stage.id);
  if (ids.some((id) => !pipeline.stages.some((stage) => stage.id === id))) throw missing();
  const removed = pipeline.stages.filter((stage) => !ids.includes(stage.id));
  if (removed.length && !args.canDeleteStages) throw new PipelineError("Nincs jogosultság szakasz törléséhez.", 403);
  if (removed.length && await tx.leadPipelinePosition.count({ where: { organizationId: args.organizationId, pipelineId: args.pipelineId, pipelineStageId: { in: removed.map((stage) => stage.id) } } })) {
    throw new PipelineError("A szakasz nem törölhető, amíg érdeklődők vannak hozzárendelve.");
  }
  await tx.pipelineStage.deleteMany({ where: { organizationId: args.organizationId, pipelineId: args.pipelineId, id: { in: removed.map((stage) => stage.id) } } });
  // Temporary negative positions avoid unique collisions while swapping stages.
  await tx.pipelineStage.updateMany({ where: { organizationId: args.organizationId, pipelineId: args.pipelineId, id: { in: ids } }, data: { position: { multiply: -1 } } });
  for (const [index, stage] of args.data.stages.entries()) {
    if (stage.id !== undefined) await tx.pipelineStage.updateMany({ where: { id: stage.id, organizationId: args.organizationId, pipelineId: args.pipelineId }, data: { name: stage.name, position: index + 1 } });
    else await tx.pipelineStage.create({ data: { organizationId: args.organizationId, pipelineId: args.pipelineId, name: stage.name, position: index + 1 } });
  }
}

async function updateDefinition(args, tx) {
  const pipeline = await getPipeline(args, tx);
  if (!pipeline) throw missing();
  if (args.data.isDefault === true) await setDefault(args.organizationId, tx);
  if (args.data.stages !== undefined) await replaceStages(args, pipeline, tx);
  const { stages: _stages, ...data } = args.data;
  await tx.pipeline.update({ where: { id: args.pipelineId, organizationId: args.organizationId }, data });
  return getPipeline(args, tx);
}
export async function updatePipeline(args, client = prisma) {
  return client.$transaction(async (tx) => {
    await lockPipelineOrganization(args.organizationId, tx);
    return updateDefinition(args, tx);
  }, { timeout: 30000 });
}

export async function mutateStage(args, client = prisma) {
  return client.$transaction(async (tx) => {
    await lockPipelineOrganization(args.organizationId, tx);
    const pipeline = await getPipeline(args, tx);
    if (!pipeline) throw missing();
    if (args.kind !== "create" && args.kind !== "reorder" && !pipeline.stages.some((stage) => stage.id === args.stageId)) throw missing();
    let stages = pipeline.stages.map(({ id, name }) => ({ id, name }));
    if (args.kind === "create") stages.push({ name: args.data.name });
    if (args.kind === "edit") stages = stages.map((stage) => stage.id === args.stageId ? { ...stage, ...args.data } : stage);
    if (args.kind === "delete") stages = stages.filter((stage) => stage.id !== args.stageId);
    if (args.kind === "reorder") {
      if (args.data.stageIds.length !== stages.length || args.data.stageIds.some((id) => !stages.some((stage) => stage.id === id))) throw new PipelineError("Az átrendezésnek a Pipeline összes szakaszát kell tartalmaznia.", 400);
      stages = args.data.stageIds.map((id) => stages.find((stage) => stage.id === id));
    }
    if (!stages.length || stages.length > 100) throw new PipelineError("A Pipeline 1–100 szakaszt tartalmazhat.", 400);
    return updateDefinition({ ...args, data: { stages }, canDeleteStages: args.kind === "delete" }, tx);
  }, { timeout: 30000 });
}

export async function deletePipeline(args, client = prisma) {
  return client.$transaction(async (tx) => {
    await lockPipelineOrganization(args.organizationId, tx);
    const pipeline = await getPipeline(args, tx);
    if (!pipeline) throw missing();
    if (await tx.leadPipelinePosition.count({ where: { organizationId: args.organizationId, pipelineId: args.pipelineId } })) throw new PipelineError("A Pipeline nem törölhető, amíg érdeklődők vannak hozzárendelve.");
    await tx.pipeline.deleteMany({ where: { id: args.pipelineId, organizationId: args.organizationId } });
    if (pipeline.isDefault) {
      const next = await tx.pipeline.findFirst({ where: { organizationId: args.organizationId }, orderBy: { id: "asc" }, select: { id: true } });
      if (next) await tx.pipeline.update({ where: { id: next.id, organizationId: args.organizationId }, data: { isDefault: true } });
    }
    return true;
  });
}

export async function moveLead(args, client = prisma) {
  return client.$transaction(async (tx) => {
    await lockPipelineOrganization(args.organizationId, tx);
    // Same lock as Lead edit/delete so a disappearing Lead cannot leave a partial move.
    await tx.$queryRaw`SELECT true AS locked FROM pg_advisory_xact_lock(${args.organizationId}::integer, ${args.leadId}::integer)`;
    const pipeline = await getPipeline(args, tx);
    const lead = await tx.lead.findFirst({ where: { id: args.leadId, organizationId: args.organizationId }, select: { id: true, name: true } });
    if (!pipeline || !lead) throw missing();
    const stage = args.stageId === null ? null : pipeline.stages.find((item) => item.id === args.stageId);
    if (args.stageId !== null && !stage) throw missing();
    const existing = await tx.leadPipelinePosition.findFirst({ where: { leadId: args.leadId, organizationId: args.organizationId }, select: { pipelineId: true, pipelineStageId: true } });
    if (existing && existing.pipelineId !== args.pipelineId) throw new PipelineError("Az érdeklődőt előbb el kell távolítani a jelenlegi Pipeline-ból.");
    if ((existing?.pipelineStageId || null) === args.stageId) return { changed: false };
    if (stage) await tx.leadPipelinePosition.upsert({
      where: { leadId: args.leadId },
      create: { organizationId: args.organizationId, leadId: args.leadId, pipelineId: args.pipelineId, pipelineStageId: stage.id },
      update: { pipelineStageId: stage.id },
    });
    else await tx.leadPipelinePosition.deleteMany({ where: { leadId: args.leadId, organizationId: args.organizationId, pipelineId: args.pipelineId } });
    await activityService.createActivity({
      organizationId: args.organizationId, actorMemberId: args.actorMemberId, entityType: "LEAD", entityId: lead.id,
      action: "PIPELINE_STAGE_CHANGED", title: "Érdeklődő Pipeline szakasza megváltozott", description: lead.name,
      metadata: { pipelineId: pipeline.id, pipelineName: pipeline.name, fromStageId: existing?.pipelineStageId || null, toStageId: args.stageId,
        fromStageName: pipeline.stages.find((item) => item.id === existing?.pipelineStageId)?.name || null, toStageName: stage?.name || null },
    }, tx);
    return { changed: true };
  });
}
export default { getPipelines, getPipeline, getBoard, createPipeline, updatePipeline, deletePipeline, mutateStage, moveLead };
