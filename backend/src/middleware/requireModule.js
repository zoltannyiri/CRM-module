import {
  assertValidModuleKey,
  isModuleEnabled,
} from "../services/organizationModuleService.js";

export default function requireModule(moduleKey) {
  assertValidModuleKey(moduleKey);

  return async function moduleAccessMiddleware(req, res, next) {
    try {
      const enabled = await isModuleEnabled(req.organization.id, moduleKey);
      if (!enabled) {
        return res.status(403).json({
          message: "Ez a modul nincs engedélyezve a szervezet számára.",
          module: moduleKey,
        });
      }
      return next();
    } catch (error) {
      return next(error);
    }
  };
}
