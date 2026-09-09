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

export default { getMembers };
