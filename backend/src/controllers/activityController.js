import activityService from "../services/activityService.js";

const VALID_ENTITY_TYPES = new Set(["PARTNER", "CONTACT", "PROJECT", "TASK", "DOCUMENT"]);
const VALID_ACTIONS = new Set([
  "CREATED",
  "UPDATED",
  "DELETED",
  "STATUS_CHANGED",
  "ASSIGNED",
  "PRIORITY_CHANGED",
]);

function parsePositiveId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

async function getActivities(req, res, next) {
  try {
    let entityType;
    if (req.query.entityType !== undefined && req.query.entityType !== "") {
      entityType = String(req.query.entityType).toUpperCase();
      if (!VALID_ENTITY_TYPES.has(entityType)) {
        return res.status(400).json({ message: "Érvénytelen entitás típus." });
      }
    }

    let action;
    if (req.query.action !== undefined && req.query.action !== "") {
      action = String(req.query.action).toUpperCase();
      if (!VALID_ACTIONS.has(action)) {
        return res.status(400).json({ message: "Érvénytelen művelet típus." });
      }
    }

    let entityId;
    if (req.query.entityId !== undefined && req.query.entityId !== "") {
      entityId = parsePositiveId(req.query.entityId);
      if (!entityId) {
        return res.status(400).json({ message: "Az entityId pozitív egész szám kell legyen." });
      }
    }

    let actorMemberId;
    if (req.query.actorMemberId !== undefined && req.query.actorMemberId !== "") {
      actorMemberId = parsePositiveId(req.query.actorMemberId);
      if (!actorMemberId) {
        return res.status(400).json({ message: "Az actorMemberId pozitív egész szám kell legyen." });
      }
    }

    let limit;
    if (req.query.limit !== undefined && req.query.limit !== "") {
      const parsedLimit = Number(req.query.limit);
      if (!Number.isSafeInteger(parsedLimit) || parsedLimit <= 0) {
        return res.status(400).json({ message: "A limit pozitív egész szám kell legyen." });
      }
      limit = Math.min(parsedLimit, 100);
    }

    let sortDirection = "desc";
    if (req.query.sortDirection !== undefined && req.query.sortDirection !== "") {
      const dir = String(req.query.sortDirection).toLowerCase();
      if (dir !== "asc" && dir !== "desc") {
        return res.status(400).json({ message: "A rendezés iránya csak 'asc' vagy 'desc' lehet." });
      }
      sortDirection = dir;
    }

    const activities = await activityService.getActivities({
      organizationId: req.organization.id,
      membership: req.membership,
      entityType,
      entityId,
      actorMemberId,
      action,
      limit,
      sortDirection,
    });

    return res.json(activities);
  } catch (error) {
    return next(error);
  }
}

export default {
  getActivities,
};
