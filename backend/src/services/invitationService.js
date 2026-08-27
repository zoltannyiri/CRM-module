import prisma from "../lib/prisma.js";
import { generateInviteToken, hashInviteToken } from "../utils/token.js";

const createInvitation = async ({
  organizationId,
  email,
  role = "USER",
}) => {
  const token = generateInviteToken();
  const tokenHash = hashInviteToken(token);

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  await prisma.invitation.create({
    data: {
      tokenHash,
      email: email?.trim().toLowerCase() || null,
      role,
      organizationId,
      expiresAt,
    },
  });

  return {
    invitationUrl: `${process.env.FRONTEND_URL}/register/${token}`,
    expiresAt,
  };
};

const invitationService = {
  createInvitation,
};

export default invitationService;