import crypto from "crypto";
import jwt from "jsonwebtoken";

export const generateInviteToken = () => {
  return crypto.randomBytes(32).toString("hex");
};

export const hashInviteToken = (token) => {
  return crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
};

export const generateAccessToken = (user) => {
  return jwt.sign(
    {
      userId: user.id,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "15m",
    }
  );
};

export const generateRefreshToken = () => {
  return crypto.randomBytes(64).toString("hex");
};

export const hashRefreshToken = (token) => {
  return crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
};