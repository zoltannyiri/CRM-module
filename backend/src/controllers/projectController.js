import projectService, { ProjectInputError } from "../services/projectService.js";

const PROJECT_STATUSES = new Set(["PLANNED", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"]);
const EDITABLE_FIELDS = new Set(["partnerId", "name", "description", "status", "startDate", "deadline"]);

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

  if (!partial || has("name")) {
    if (typeof source.name !== "string" || !source.name.trim()) return { error: "A projekt neve kötelező." };
    data.name = source.name.trim();
  }
  if (!partial || has("description")) {
    data.description = typeof source.description === "string" && source.description.trim()
      ? source.description.trim()
      : null;
  }
  if (!partial || has("status")) {
    const status = source.status || "PLANNED";
    if (!PROJECT_STATUSES.has(status)) return { error: "Érvénytelen projektstátusz." };
    data.status = status;
  }
  if (!partial || has("partnerId")) {
    if (source.partnerId === null || source.partnerId === "" || source.partnerId === undefined) {
      data.partnerId = null;
    } else {
      const partnerId = parsePositiveId(source.partnerId);
      if (!partnerId) return { error: "A partnerId pozitív egész szám kell legyen." };
      data.partnerId = partnerId;
    }
  }
  for (const field of ["startDate", "deadline"]) {
    if (!partial || has(field)) {
      const parsed = parseOptionalDate(source[field] ?? null);
      if (parsed.error) return { error: "A dátumokat ÉÉÉÉ-HH-NN formátumban add meg." };
      data[field] = parsed.value;
    }
  }
  if (data.startDate && data.deadline && data.deadline < data.startDate) {
    return { error: "A határidő nem lehet korábbi a kezdési dátumnál." };
  }
  return { data };
}

async function getProjects(req, res, next) {
  try {
    const status = req.query.status ? String(req.query.status) : undefined;
    if (status && !PROJECT_STATUSES.has(status)) return res.status(400).json({ message: "Érvénytelen projektstátusz." });
    const partnerId = req.query.partnerId === undefined ? undefined : parsePositiveId(req.query.partnerId);
    if (req.query.partnerId !== undefined && !partnerId) return res.status(400).json({ message: "A partnerId pozitív egész szám kell legyen." });
    const projects = await projectService.getProjects({
      organizationId: req.organization.id,
      query: String(req.query.q || ""),
      status,
      partnerId,
      sortDirection: req.query.sortDirection === "asc" ? "asc" : "desc",
    });
    return res.json(projects);
  } catch (error) { return next(error); }
}

async function getProjectById(req, res, next) {
  try {
    const projectId = parsePositiveId(req.params.id);
    if (!projectId) return res.status(400).json({ message: "Érvénytelen projektazonosító." });
    const project = await projectService.getProjectById({ organizationId: req.organization.id, projectId });
    if (!project) return res.status(404).json({ message: "Projekt nem található." });
    return res.json(project);
  } catch (error) { return next(error); }
}

async function createProject(req, res, next) {
  try {
    const normalized = normalizePayload(req.body);
    if (normalized.error) return res.status(400).json({ message: normalized.error });
    const project = await projectService.createProject({
      organizationId: req.organization.id,
      actorMemberId: req.membership?.id,
      data: normalized.data,
    });
    if (!project) return res.status(404).json({ message: "Partner nem található." });
    return res.status(201).json(project);
  } catch (error) { return next(error); }
}

async function updateProject(req, res, next) {
  try {
    const projectId = parsePositiveId(req.params.id);
    if (!projectId) return res.status(400).json({ message: "Érvénytelen projektazonosító." });
    const allowedBody = Object.fromEntries(Object.entries(req.body || {}).filter(([key]) => EDITABLE_FIELDS.has(key)));
    const normalized = normalizePayload(allowedBody, { partial: true });
    if (normalized.error) return res.status(400).json({ message: normalized.error });
    const project = await projectService.updateProject({
      organizationId: req.organization.id,
      actorMemberId: req.membership?.id,
      projectId,
      data: normalized.data,
    });
    if (!project) return res.status(404).json({ message: "Projekt vagy partner nem található." });
    return res.json(project);
  } catch (error) {
    if (error instanceof ProjectInputError) return res.status(400).json({ message: error.message });
    return next(error);
  }
}

async function deleteProject(req, res, next) {
  try {
    const projectId = parsePositiveId(req.params.id);
    if (!projectId) return res.status(400).json({ message: "Érvénytelen projektazonosító." });
    const deleted = await projectService.deleteProject({
      organizationId: req.organization.id,
      actorMemberId: req.membership?.id,
      projectId,
    });
    if (!deleted) return res.status(404).json({ message: "Projekt nem található." });
    return res.json({ message: "Projekt törölve." });
  } catch (error) { return next(error); }
}

export default { getProjects, getProjectById, createProject, updateProject, deleteProject };
