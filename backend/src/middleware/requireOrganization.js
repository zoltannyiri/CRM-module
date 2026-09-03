import prisma from '../lib/prisma.js';

const requireOrganization = async (req, res, next) => {
  try {
    const membership = await prisma.organizationMember.findFirst({
      where: {
        userId: req.user.userId,
      },
      include: {
        organization: true,
      },
    });

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