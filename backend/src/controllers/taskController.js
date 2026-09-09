import taskService from "../services/taskService.js";
import permissionService from "../services/permissionService.js";

const TASK_STATUSES = new Set(["TODO", "IN_PROGRESS", "BLOCKED", "DONE", "CANCELLED"]);
const TASK_PRIORITIES = new Set(["LOW", "MEDIUM", "HIGH", "URGENT"]);
const EDITABLE_FIELDS = new Set(["title", "description", "projectId", "assigneeMemberId", "status", "priority", "dueDate"]);

function parsePositiveId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function parseOptionalDate(value) {
  if (value === null || value === "") return { value: null };
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return { error: true };
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return { error: true };
  return { value: date };
}

function normalizePayload(body, { partial = false } = {}) {
  const source = body || {};
  const data = {};
  const has = (key) => Object.hasOwn(source, key);

  if (!partial || has("title")) {
    if (typeof source.title !== "string" || !source.title.trim()) return { error: "A feladat neve kötelező." };
    data.title = source.title.trim();
  }

  if (!partial || has("description")) {
    data.description = typeof source.description === "string" && source.description.trim()
      ? source.description.trim()
      : null;
  }

  if (!partial || has("status")) {
    const status = source.status || "TODO";
    if (!TASK_STATUSES.has(status)) return { error: "Érvénytelen feladatstátusz." };
    data.status = status;
  }

  if (!partial || has("priority")) {
    const priority = source.priority || "MEDIUM";
    if (!TASK_PRIORITIES.has(priority)) return { error: "Érvénytelen prioritás." };
    data.priority = priority;
  }

  if (!partial || has("projectId")) {
    if (source.projectId === null || source.projectId === "" || source.projectId === undefined) {
      data.projectId = null;
    } else {
      const projectId = parsePositiveId(source.projectId);
      if (!projectId) return { error: "A projectId pozitív egész szám kell legyen." };
      data.projectId = projectId;
    }
  }

  if (!partial || has("assigneeMemberId")) {
    if (source.assigneeMemberId === null || source.assigneeMemberId === "" || source.assigneeMemberId === undefined) {
      data.assigneeMemberId = null;
    } else {
      const assigneeMemberId = parsePositiveId(source.assigneeMemberId);
      if (!assigneeMemberId) return { error: "Az assigneeMemberId pozitív egész szám kell legyen." };
      data.assigneeMemberId = assigneeMemberId;
    }
  }

  if (!partial || has("dueDate")) {
    const parsed = parseOptionalDate(source.dueDate ?? null);
    if (parsed.error) return { error: "A dátumot ÉÉÉÉ-HH-NN formátumban add meg." };
    data.dueDate = parsed.value;
  }

  return { data };
}

async function getTasks(req, res, next) {
  try {
    const status = req.query.status ? String(req.query.status) : undefined;
    if (status && !TASK_STATUSES.has(status)) return res.status(400).json({ message: "Érvénytelen feladatstátusz." });

    const priority = req.query.priority ? String(req.query.priority) : undefined;
    if (priority && !TASK_PRIORITIES.has(priority)) return res.status(400).json({ message: "Érvénytelen prioritás." });

    let projectId;
    if (req.query.projectId !== undefined) {
      projectId = parsePositiveId(req.query.projectId);
      if (!projectId) return res.status(400).json({ message: "A projectId pozitív egész szám kell legyen." });
    }

    let assigneeMemberId;
    if (req.query.assigneeMemberId !== undefined) {
      assigneeMemberId = parsePositiveId(req.query.assigneeMemberId);
      if (!assigneeMemberId) return res.status(400).json({ message: "Az assigneeMemberId pozitív egész szám kell legyen." });
    }

    const tasks = await taskService.getTasks({
      organizationId: req.organization.id,
      query: String(req.query.q || ""),
      status,
      priority,
      projectId,
      assigneeMemberId,
      sortDirection: req.query.sortDirection === "asc" ? "asc" : "desc",
    });
    return res.json(tasks);
  } catch (error) {
    return next(error);
  }
}

async function getTaskById(req, res, next) {
  try {
    const taskId = parsePositiveId(req.params.id);
    if (!taskId) return res.status(400).json({ message: "Érvénytelen feladatazonosító." });
    const task = await taskService.getTaskById({ organizationId: req.organization.id, taskId });
    if (!task) return res.status(404).json({ message: "Feladat nem található." });
    return res.json(task);
  } catch (error) {
    return next(error);
  }
}

async function createTask(req, res, next) {
  try {
    const normalized = normalizePayload(req.body);
    if (normalized.error) return res.status(400).json({ message: normalized.error });

    if (normalized.data.assigneeMemberId !== null && normalized.data.assigneeMemberId !== undefined) {
      if (!(await permissionService.hasPermission(req.membership, "TASKS_ASSIGN"))) {
        return res.status(403).json({
          message: "Nincs jogosultsága felelős hozzárendeléséhez.",
          code: "PERMISSION_DENIED",
          permission: "TASKS_ASSIGN",
        });
      }
    }

    const task = await taskService.createTask({
      organizationId: req.organization.id,
      actorMemberId: req.membership?.id,
      data: normalized.data,
    });
    if (!task) return res.status(404).json({ message: "Projekt vagy szervezeti tag nem található." });
    return res.status(201).json(task);
  } catch (error) {
    return next(error);
  }
}

async function updateTask(req, res, next) {
  try {
    const taskId = parsePositiveId(req.params.id);
    if (!taskId) return res.status(400).json({ message: "Érvénytelen feladatazonosító." });
    const allowedBody = Object.fromEntries(
      Object.entries(req.body || {}).filter(([key]) => EDITABLE_FIELDS.has(key)),
    );
    const normalized = normalizePayload(allowedBody, { partial: true });
    if (normalized.error) return res.status(400).json({ message: normalized.error });

    if (normalized.data.assigneeMemberId !== undefined) {
      const existingTask = await taskService.getTaskById({ organizationId: req.organization.id, taskId });
      if (!existingTask) return res.status(404).json({ message: "Feladat nem található." });
      if (existingTask.assigneeMemberId !== normalized.data.assigneeMemberId) {
        if (!(await permissionService.hasPermission(req.membership, "TASKS_ASSIGN"))) {
          return res.status(403).json({
            message: "Nincs jogosultsága felelős módosításához.",
            code: "PERMISSION_DENIED",
            permission: "TASKS_ASSIGN",
          });
        }
      }
    }

    const task = await taskService.updateTask({
      organizationId: req.organization.id,
      actorMemberId: req.membership?.id,
      taskId,
      data: normalized.data,
    });
    if (!task) return res.status(404).json({ message: "Feladat, projekt vagy szervezeti tag nem található." });
    return res.json(task);
  } catch (error) {
    return next(error);
  }
}

async function deleteTask(req, res, next) {
  try {
    const taskId = parsePositiveId(req.params.id);
    if (!taskId) return res.status(400).json({ message: "Érvénytelen feladatazonosító." });
    const deleted = await taskService.deleteTask({
      organizationId: req.organization.id,
      actorMemberId: req.membership?.id,
      taskId,
    });
    if (!deleted) return res.status(404).json({ message: "Feladat nem található." });
    return res.json({ message: "Feladat törölve." });
  } catch (error) {
    return next(error);
  }
}

export default { getTasks, getTaskById, createTask, updateTask, deleteTask };
