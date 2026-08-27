const adminMiddleware = (req, res, next) => {
  if (req.user?.role !== "ADMIN") {
    return res.status(403).json({
      message: "Ehhez a művelethez admin jogosultság szükséges.",
    });
  }

  next();
};

export default adminMiddleware;