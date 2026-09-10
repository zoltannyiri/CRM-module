import dashboardService from "../services/dashboardService.js";

async function getDashboard(req, res, next) {
  try {
    return res.json(await dashboardService.getDashboard({
      organizationId: req.organization.id,
      membership: req.membership,
    }));
  } catch (error) {
    return next(error);
  }
}

export default { getDashboard };
