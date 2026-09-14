import dashboardService from "../services/dashboardService.js";
import { normalizeFilters } from "./followUpController.js";

async function getDashboard(req, res, next) {
  try {
    const normalized = normalizeFilters({ timeZone: req.query.timeZone });
    if (normalized.error) return res.status(400).json({ message: normalized.error });
    return res.json(await dashboardService.getDashboard({
      organizationId: req.organization.id,
      membership: req.membership,
      timeZone: normalized.data.timeZone,
    }));
  } catch (error) {
    return next(error);
  }
}

export default { getDashboard };
