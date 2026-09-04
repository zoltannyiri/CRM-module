import { getDefaultMembership } from '../services/organizationService.js';

const requireOrganization = async (req, res, next) => {
  try {
    const membership = await getDefaultMembership(req.user.userId);

    if (!membership) {
      return res.status(403).json({
        message: 'A felhasználó nem tartozik szervezethez.',
      });
    }

    req.organization = membership.organization;
    req.membership = membership;

    next();
  } catch (error) {
    next(error);
  }
};

export default requireOrganization;
