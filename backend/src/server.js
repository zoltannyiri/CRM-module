import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import authRoutes from "./routes/authRoutes.js";
import contactRoutes from "./routes/contactRoutes.js";
import partnerRoutes from "./routes/partnerRoutes.js";
import projectRoutes from "./routes/projectRoutes.js";
import memberRoutes from "./routes/memberRoutes.js";
import taskRoutes from "./routes/taskRoutes.js";
import activityRoutes from "./routes/activityRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import documentRoutes from "./routes/documentRoutes.js";
import leadRoutes from "./routes/leadRoutes.js";
import offerRoutes from "./routes/offerRoutes.js";

const app = express();

const allowedOrigins = (process.env.FRONTEND_URL || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error("A kérés originje nincs engedélyezve."));
  },
  credentials: true,
  exposedHeaders: ["Content-Disposition"],
}));

app.use(express.json());
app.use(cookieParser());

app.use("/api/auth", authRoutes);
app.use("/api/contacts", contactRoutes);
app.use("/api/partners", partnerRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/members", memberRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/activities", activityRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api/offers", offerRoutes);
app.use("/api/leads", leadRoutes);

app.use((error, _req, res, _next) => {
  const candidateStatus = error?.statusCode ?? error?.status;
  const statusCode = Number.isInteger(candidateStatus) && candidateStatus >= 400 && candidateStatus <= 599
    ? candidateStatus
    : 500;
  if (statusCode >= 500) console.error(error);

  return res.status(statusCode).json({
    message:
      statusCode >= 500
        ? "A művelet technikai hiba miatt nem hajtható végre. Kérjük, próbálja meg később. Ha a hiba továbbra is fennáll, vegye fel a kapcsolatot az üzemeltetővel: zoltan.nyiri02@gmail.com"
        : error.message,

    ...(statusCode < 500 && error?.code && { code: error.code }),
    ...(statusCode < 500 && error?.permission && { permission: error.permission }),
    ...(statusCode < 500 && error?.module && { module: error.module }),
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
