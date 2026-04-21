import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthenticatedRequest } from "../../auth/index.js";
import { ok, handleError, parseBody } from "../../../common/routing/helpers.js";
import { findUserBySubject } from "../../users/services/profile.service.js";
import { getQuestions, saveAnswers, completeOnboarding } from "../services/onboarding.service.js";

export const onboardingRouter = Router();

/* ── GET /onboarding/questions (public — no auth) ── */

onboardingRouter.get("/onboarding/questions", async (_req, res) => {
  try {
    const questions = await getQuestions();
    ok(res, { questions });
  } catch (err) {
    handleError(res, err);
  }
});

/* ── PUT /me/answers ─────────────────────────────── */

const saveAnswersSchema = z.object({
  answers: z.array(
    z.object({
      questionKey: z.string(),
      optionValues: z.array(z.string()).optional(),
      answerText: z.string().max(500).optional(),
    }),
  ),
});

onboardingRouter.put("/me/answers", requireAuth, async (req, res) => {
  try {
    const { auth } = req as AuthenticatedRequest;
    const user = await findUserBySubject(auth.sub);
    if (!user) {
      res.status(400).json({ error: "User not found. Call /me/bootstrap first." });
      return;
    }
    const body = parseBody(req.body, saveAnswersSchema);
    const result = await saveAnswers(user.id, body.answers);
    ok(res, result);
  } catch (err) {
    handleError(res, err);
  }
});

/* ── POST /me/onboarding/complete ────────────────── */

onboardingRouter.post("/me/onboarding/complete", requireAuth, async (req, res) => {
  try {
    const { auth } = req as AuthenticatedRequest;
    const user = await findUserBySubject(auth.sub);
    if (!user) {
      res.status(400).json({ error: "User not found. Call /me/bootstrap first." });
      return;
    }
    const result = await completeOnboarding(user.id);
    ok(res, result);
  } catch (err) {
    handleError(res, err);
  }
});
