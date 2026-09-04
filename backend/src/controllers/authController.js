import prisma from "../lib/prisma.js";
import authService, { toPublicUser } from "../services/authService.js";
import invitationService from "../services/invitationService.js";

const refreshCookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  maxAge: 30 * 24 * 60 * 60 * 1000,
};

const setRefreshCookie = (res, refreshToken) => {
  res.cookie("refreshToken", refreshToken, refreshCookieOptions);
};

export const validateInvitation = async (req, res) => {
  try {
    const result = await authService.validateInvitation(req.params.token);

    return res.json(result);
  } catch (error) {
    return res.status(400).json({
      message: error.message,
    });
  }
};

export const register = async (req, res) => {
  try {
    const result = await authService.registerUser({
      token: req.params.token,
      email: req.body.email,
      password: req.body.password,
      firstName: req.body.firstName,
      lastName: req.body.lastName,
    });

    setRefreshCookie(res, result.refreshToken);
    delete result.refreshToken;

    return res.status(201).json(result);
  } catch (error) {
    return res.status(400).json({
      message: error.message,
    });
  }
};

export const login = async (req, res) => {
  try {
    const result = await authService.loginUser(req.body);

    setRefreshCookie(res, result.refreshToken);
    delete result.refreshToken;

    return res.json(result);
  } catch (error) {
    return res.status(401).json({
      message: error.message,
    });
  }
};

export const me = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: {
        id: req.user.userId,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        message: "Felhasználó nem található.",
      });
    }

    return res.json(toPublicUser(user, {
      ...req.membership,
      organization: req.organization,
    }));
  } catch (error) {
    return res.status(500).json({
      message: error.message,
    });
  }
};

export const createInvitation = async (req, res) => {
  try {
    const result = await invitationService.createInvitation({
      organizationId: req.organization.id,
      email: req.body?.email,
      role: req.body?.role || "USER",
    });

    return res.status(201).json(result);
  } catch (error) {
    return res.status(400).json({
      message: error.message,
    });
  }
};

export const refresh = async (req, res) => {
  try {
    const result = await authService.refreshAccessToken(req.cookies.refreshToken);

    setRefreshCookie(res, result.refreshToken);

    return res.json({
      accessToken: result.accessToken,
    });
  } catch (error) {
    res.clearCookie("refreshToken", refreshCookieOptions);

    return res.status(401).json({
      message: error.message,
    });
  }
};

export const logout = async (req, res) => {
  await authService.revokeSession(req.cookies.refreshToken);
  res.clearCookie("refreshToken", refreshCookieOptions);

  return res.status(204).send();
};
