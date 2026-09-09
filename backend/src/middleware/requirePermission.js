import { assertValidPermissionKey, hasPermission } from "../services/permissionService.js";

export default function requirePermission(permissionKey) {
  assertValidPermissionKey(permissionKey);
  return async function permissionMiddleware(req, res, next) {
    try {
      if (!(await hasPermission(req.membership, permissionKey))) {
        return res.status(403).json({
          message: "Nincs jogosultsága a művelet végrehajtásához.",
          code: "PERMISSION_DENIED",
          permission: permissionKey,
        });
      }
      return next();
    } catch (error) {
      return next(error);
    }
  };
}
