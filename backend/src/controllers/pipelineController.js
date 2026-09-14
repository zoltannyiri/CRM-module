import service from "../services/pipelineService.js";
import { hasPermission } from "../services/permissionService.js";
import { isModuleEnabled } from "../services/organizationModuleService.js";

const validId = (value) => typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 2147483647;
export function parseId(value) {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return validId(id) ? id : null;
}
function object(body, allowed) {
  return body && typeof body === "object" && !Array.isArray(body) && Object.keys(body).every((key) => allowed.includes(key));
}
function name(value) { return typeof value === "string" && value.trim().length > 0 && value.trim().length <= 200; }
export function normalizePipeline(body, partial = false) {
  if (!object(body, ["name", "isDefault", "stages"])) return { error: "Ismeretlen vagy érvénytelen Pipeline mező." };
  const data = {};
  if (!partial || Object.hasOwn(body, "name")) {
    if (!name(body.name)) return { error: "A név kötelező, legfeljebb 200 karakter." };
    data.name = body.name.trim();
  }
  if (Object.hasOwn(body, "isDefault")) {
    if (typeof body.isDefault !== "boolean") return { error: "Az alapértelmezett mező logikai érték kell legyen." };
    data.isDefault = body.isDefault;
  }
  if (Object.hasOwn(body, "stages")) {
    if (!Array.isArray(body.stages) || body.stages.length < 1 || body.stages.length > 100) return { error: "A Pipeline 1–100 szakaszt tartalmazhat." };
    const ids = new Set();
    data.stages = [];
    for (const stage of body.stages) {
      if (!object(stage, partial ? ["id", "name"] : ["name"]) || !name(stage.name)) return { error: "Érvénytelen szakasz adatok." };
      if (Object.hasOwn(stage, "id")) {
        if (!validId(stage.id) || ids.has(stage.id)) return { error: "Érvénytelen vagy ismételt szakasz azonosító." };
        ids.add(stage.id);
      }
      data.stages.push({ ...(stage.id !== undefined && { id: stage.id }), name: stage.name.trim() });
    }
  }
  return { data };
}
export function normalizeStage(body, kind) {
  if (kind === "move") {
    if (!object(body, ["stageId"]) || !Object.hasOwn(body, "stageId") || (body.stageId !== null && !validId(body.stageId))) return { error: "Érvénytelen szakasz azonosító." };
    return { data: { stageId: body.stageId } };
  }
  if (kind === "reorder") {
    if (!object(body, ["stageIds"]) || !Array.isArray(body.stageIds) || body.stageIds.length < 1 || body.stageIds.length > 100 || !body.stageIds.every(validId) || new Set(body.stageIds).size !== body.stageIds.length) return { error: "Érvénytelen szakasz sorrend." };
    return { data: { stageIds: body.stageIds } };
  }
  if (!object(body, ["name"]) || (kind === "create" || Object.hasOwn(body, "name")) && !name(body.name)) return { error: "Érvénytelen szakasz név." };
  return { data: Object.hasOwn(body, "name") ? { name: body.name.trim() } : {} };
}

async function handle(req, res, next, operation) {
  try {
    const args = { organizationId: req.organization.id, actorMemberId: req.membership.id };
    for (const [param, field] of [["id", "pipelineId"], ["stageId", "stageId"], ["leadId", "leadId"]]) {
      if (req.params[param] !== undefined) {
        const id = parseId(req.params[param]);
        if (!id) return res.status(400).json({ message: "Érvénytelen azonosító." });
        args[field] = id;
      }
    }
    let result;
    if (operation === "list") result = await service.getPipelines(args);
    if (operation === "show") {
      result = await service.getPipeline(args);
      if (!result) return res.status(404).json({ message: "Pipeline nem található." });
    }
    if (operation === "board") {
      if (req.query.search !== undefined && (typeof req.query.search !== "string" || req.query.search.length > 200)) return res.status(400).json({ message: "Érvénytelen keresés." });
      if (req.query.assignedMemberId !== undefined) {
        args.assignedMemberId = parseId(req.query.assignedMemberId);
        if (!args.assignedMemberId) return res.status(400).json({ message: "Érvénytelen felelős szűrő." });
      }
      const canViewFollowUps = await isModuleEnabled(args.organizationId, "FOLLOW_UPS") && await hasPermission(req.membership, "FOLLOW_UPS_VIEW");
      result = await service.getBoard({ ...args, search: req.query.search, canViewFollowUps });
    }
    if (operation === "create" || operation === "edit") {
      const normalized = normalizePipeline(req.body, operation === "edit");
      if (normalized.error) return res.status(400).json({ message: normalized.error });
      result = operation === "create" ? await service.createPipeline({ ...args, data: normalized.data })
        : await service.updatePipeline({ ...args, data: normalized.data, canDeleteStages: await hasPermission(req.membership, "PIPELINE_DELETE") });
    }
    if (operation === "delete") {
      await service.deletePipeline(args);
      result = { message: "Pipeline törölve." };
    }
    if (operation.startsWith("stage:")) {
      const kind = operation.slice(6);
      const normalized = kind === "delete" ? { data: {} } : normalizeStage(req.body, kind);
      if (normalized.error) return res.status(400).json({ message: normalized.error });
      result = await service.mutateStage({ ...args, kind, data: normalized.data });
    }
    if (operation === "move") {
      const normalized = normalizeStage(req.body, "move");
      if (normalized.error) return res.status(400).json({ message: normalized.error });
      result = await service.moveLead({ ...args, stageId: normalized.data.stageId });
    }
    return res.status(operation === "create" || operation === "stage:create" ? 201 : 200).json(result);
  } catch (error) { return next(error); }
}
const action = (operation) => (req, res, next) => handle(req, res, next, operation);
export default {
  list: action("list"), show: action("show"), board: action("board"),
  create: action("create"), edit: action("edit"), delete: action("delete"),
  createStage: action("stage:create"), editStage: action("stage:edit"), deleteStage: action("stage:delete"), reorderStages: action("stage:reorder"),
  move: action("move"),
};
