import { hasPermission } from "../services/permissionService.js";
import { isModuleEnabled } from "../services/organizationModuleService.js";
import viewPreferenceService from "../services/viewPreferenceService.js";
import { assertListEntityType } from "../services/viewPreferenceRegistry.js";

const accessByEntity = Object.freeze({ LEAD: { module: "LEADS", permission: "LEADS_VIEW" }, PARTNER: { module: "PARTNERS", permission: "PARTNERS_VIEW" } });

async function context(req, res) {
  const entityType = String(req.params.entityType || "").toUpperCase();
  try { assertListEntityType(entityType); } catch (error) { res.status(400).json({ message: error.message }); return null; }
  const access = accessByEntity[entityType];
  if (!await isModuleEnabled(req.organization.id, access.module) || !await hasPermission(req.membership, access.permission)) {
    res.status(403).json({ message: "Nincs jogosultsága a lista beállításához.", code: "PERMISSION_DENIED" }); return null;
  }
  return { organizationId: req.organization.id, organizationMemberId: req.membership.id, entityType };
}

async function getPreference(req, res, next) { try { const args = await context(req, res); if (args) res.json(await viewPreferenceService.getResolvedPreference(args)); } catch (error) { next(error); } }
async function putPreference(req, res, next) {
  try {
    const args = await context(req, res); if (!args) return;
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body) || Object.keys(req.body).some((key) => key !== "columns")) return res.status(400).json({ message: "Érvénytelen nézetbeállítás." });
    return res.json(await viewPreferenceService.savePreference({ ...args, columns: req.body.columns }));
  } catch (error) { return next(error); }
}
async function deletePreference(req, res, next) { try { const args = await context(req, res); if (args) res.json(await viewPreferenceService.resetPreference(args)); } catch (error) { next(error); } }

export default { getPreference, putPreference, deletePreference };
