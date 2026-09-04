import bcrypt from "bcryptjs";

import prisma from "../lib/prisma.js";
import { getDefaultMembership } from "./organizationService.js";

import {
  generateAccessToken,
  generateRefreshToken,
  hashInviteToken,
  hashRefreshToken,
} from "../utils/token.js";

const getValidInvitation = async (token) => {
  const invitation = await prisma.invitation.findUnique({
    where: {
      tokenHash: hashInviteToken(token),
    },
    include: {
      organization: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!invitation || invitation.usedAt || invitation.expiresAt <= new Date()) {
    throw new Error("A meghívó érvénytelen vagy lejárt.");
  }

  return invitation;
};

const validateInvitation = async (token) => {
  const invitation = await getValidInvitation(token);

  return {
    email: invitation.email,
    role: invitation.role,
    organization: invitation.organization,
    expiresAt: invitation.expiresAt,
  };
};

const createSession = async (user) => {
  const refreshToken = generateRefreshToken();

  await prisma.session.create({
    data: {
      userId: user.id,
      refreshTokenHash: hashRefreshToken(refreshToken),
    },
  });

  return refreshToken;
};

export const toPublicUser = (user, membership) => ({
  id: user.id,
  email: user.email,
  firstName: user.firstName,
  lastName: user.lastName,

  role: membership?.role ?? null,
  organizationId: membership?.organizationId ?? null,

  organization: membership?.organization
    ? {
        id: membership.organization.id,
        name: membership.organization.name,
        slug: membership.organization.slug,
      }
    : null,
});

const registerUser = async ({
  token,
  email,
  password,
  firstName,
  lastName,
}) => {
  if (!email || !password || !firstName || !lastName) {
    throw new Error("Minden mező kitöltése kötelező.");
  }

  if (password.length < 8) {
    throw new Error("A jelszónak legalább 8 karakter hosszúnak kell lennie.");
  }

  const normalizedEmail = email.trim().toLowerCase();
  const invitation = await getValidInvitation(token);

  if (invitation.email && invitation.email !== normalizedEmail) {
    throw new Error("A meghívó másik email címhez tartozik.");
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const { user, membership } = await prisma.$transaction(async (transaction) => {
    const claimed = await transaction.invitation.updateMany({
      where: {
        id: invitation.id,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { usedAt: new Date() },
    });

    if (claimed.count !== 1) {
      throw new Error("A meghívó érvénytelen vagy lejárt.");
    }

    const existingUser = await transaction.user.findUnique({
      where: {
        email: normalizedEmail,
      },
    });

    if (existingUser) {
      throw new Error("Ezzel az email címmel már létezik felhasználó.");
    }

    const createdUser = await transaction.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      },
    });

    const membership = await transaction.organizationMember.create({
      data: {
        userId: createdUser.id,
        organizationId: invitation.organizationId,
        role: invitation.role,
      },
      include: {
        organization: true,
      },
    });

    return { user: createdUser, membership };
  });

  return {
    accessToken: generateAccessToken(user),
    refreshToken: await createSession(user),
    user: toPublicUser(user, membership),
  };
};

const loginUser = async ({ email, password }) => {
  if (typeof email !== "string" || typeof password !== "string") {
    throw new Error("Hibás email cím vagy jelszó.");
  }
  const normalizedEmail = email.trim().toLowerCase();

  const user = await prisma.user.findUnique({
    where: {
      email: normalizedEmail,
    },
  });

  if (!user) {
    throw new Error("Hibás email cím vagy jelszó.");
  }

  const passwordValid = await bcrypt.compare(
    password,
    user.passwordHash
  );

  if (!passwordValid) {
    throw new Error("Hibás email cím vagy jelszó.");
  }

  const membership = await getDefaultMembership(user.id);

  return {
    accessToken: generateAccessToken(user),
    refreshToken: await createSession(user),
    user: toPublicUser(user, membership),
  };
};

const refreshAccessToken = async (refreshToken) => {
  if (!refreshToken) {
    throw new Error("Nincs refresh token.");
  }

  const session = await prisma.session.findUnique({
    where: {
      refreshTokenHash: hashRefreshToken(refreshToken),
    },
    include: {
      user: true,
    },
  });

  const sessionLifetime = 30 * 24 * 60 * 60 * 1000;
  const expired = session && (
    Date.now() - session.createdAt.getTime() >= sessionLifetime ||
    (session.expiresAt && session.expiresAt <= new Date())
  );

  if (!session || session.revokedAt || expired) {
    throw new Error("Érvénytelen vagy lejárt refresh token.");
  }

  const nextRefreshToken = generateRefreshToken();

  await prisma.$transaction(async (transaction) => {
    const revoked = await transaction.session.updateMany({
      where: {
        id: session.id,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
        lastUsedAt: new Date(),
      },
    });

    if (revoked.count !== 1) {
      throw new Error("Érvénytelen vagy lejárt refresh token.");
    }

    await transaction.session.create({
      data: {
        userId: session.userId,
        refreshTokenHash: hashRefreshToken(nextRefreshToken),
      },
    });
  });

  return {
    accessToken: generateAccessToken(session.user),
    refreshToken: nextRefreshToken,
  };
};

const revokeSession = async (refreshToken) => {
  if (!refreshToken) {
    return;
  }

  await prisma.session.updateMany({
    where: {
      refreshTokenHash: hashRefreshToken(refreshToken),
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });
};

const authService = {
  validateInvitation,
  registerUser,
  loginUser,
  refreshAccessToken,
  revokeSession,
};

export default authService;
