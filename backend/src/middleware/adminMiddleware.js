const adminMiddleware = (req, res, next) => {
  const role = req.membership?.role;

  if (role !== "OWNER" && role !== "ADMIN") {
    return res.status(403).json({
      message: "Ehhez a művelethez admin jogosultság szükséges.",
    });
  }

  next();
};

export default adminMiddleware;