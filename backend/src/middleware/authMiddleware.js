import jwt from "jsonwebtoken";

const authMiddleware = (req, res, next) => {
  const authorization = req.headers.authorization;

  if (!authorization?.startsWith("Bearer ")) {
    return res.status(401).json({
      message: "Nincs bejelentkezve.",
    });
  }

  const token = authorization.split(" ")[1];

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    req.user = decoded;

    next();
  } catch {
    return res.status(401).json({
      message: "Érvénytelen vagy lejárt munkamenet.",
    });
  }
};

export default authMiddleware;