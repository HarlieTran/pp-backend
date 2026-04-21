import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthenticatedRequest } from "../../auth/index.js";
import { ok, badRequest, handleError, parseBody } from "../../../common/routing/helpers.js";
import { bootstrapUser, getProfile, updateProfile, findUserBySubject } from "../services/profile.service.js";

export const usersRouter = Router();

/* ── GET /health (public) ──────────────────── */

usersRouter.get("/health", (_req, res) => {
  ok(res, { ok: true });
});

/* ── POST /me/bootstrap ────────────────────── */

usersRouter.post("/me/bootstrap", requireAuth, async (req, res) => {
  try {
    const { auth } = req as AuthenticatedRequest;
    const profile = await bootstrapUser(auth);
    ok(res, profile);
  } catch (err) {
    handleError(res, err);
  }
});

/* ── GET /me/profile ───────────────────────── */

usersRouter.get("/me/profile", requireAuth, async (req, res) => {
  try {
    const { auth } = req as AuthenticatedRequest;
    const user = await findUserBySubject(auth.sub);
    if (!user) {
      badRequest(res, "User not found. Call /me/bootstrap first.");
      return;
    }
    const profile = await getProfile(user.id);
    ok(res, profile);
  } catch (err) {
    handleError(res, err);
  }
});

/* ── PATCH /me/profile ─────────────────────── */

const updateProfileSchema = z.object({
  displayName: z.string().max(120).optional(),
  likes: z.string().max(500).optional(),
  dietType: z.array(z.string()).optional(),
  allergies: z.array(z.string()).optional(),
  disliked: z.string().max(500).optional(),
  notes: z.string().max(500).optional(),
});

usersRouter.patch("/me/profile", requireAuth, async (req, res) => {
  try {
    const { auth } = req as AuthenticatedRequest;
    const data = parseBody(req.body, updateProfileSchema);
    const user = await findUserBySubject(auth.sub);
    if (!user) {
      badRequest(res, "User not found. Call /me/bootstrap first.");
      return;
    }
    const profile = await updateProfile(user.id, data);
    ok(res, profile);
  } catch (err) {
    handleError(res, err);
  }
});
