import memberService from "../services/memberService.js";

async function getMembers(req, res, next) {
  try {
    const members = await memberService.getMembers({
      organizationId: req.organization.id,
    });
    return res.json(members);
  } catch (error) {
    return next(error);
  }
}

function parseMemberId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

async function getMemberPermissions(req, res, next) {
  try {
    const memberId = parseMemberId(req.params.id);
    if (!memberId) return res.status(400).json({ message: "Érvénytelen szervezeti tag azonosító." });
    const result = await memberService.getMemberPermissions({
      actorMembership: req.membership,
      memberId,
    });
    return res.json(result);
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    return next(error);
  }
}

async function updateMemberPermissions(req, res, next) {
  try {
    const memberId = parseMemberId(req.params.id);
    if (!memberId) return res.status(400).json({ message: "Érvénytelen szervezeti tag azonosító." });
    const result = await memberService.setMemberPermissions({
      actorMembership: req.membership,
      memberId,
      permissions: req.body?.permissions,
    });
    return res.json(result);
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    return next(error);
  }
}

export default { getMembers, getMemberPermissions, updateMemberPermissions };
