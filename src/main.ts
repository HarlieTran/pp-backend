import express from "express";
import cors from "cors";
import { apiRouter } from "./modules/api/routes/router.js";

const PORT = Number(process.env.PORT ?? 8788);
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN ?? "http://localhost:5173";
const allowedOrigins = FRONTEND_ORIGIN.split(",").map(o => o.trim());

const app = express();

/* ── Middleware ─────────────────────────────── */

app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type"],
  }),
);

app.use(express.json({ limit: "5mb" }));

/* ── Routes ────────────────────────────────── */

app.use(apiRouter);

/* ── Start ─────────────────────────────────── */

app.listen(PORT, () => {
  console.log(`🚀 PantryPal API listening on http://localhost:${PORT}`);
});

export { app };
