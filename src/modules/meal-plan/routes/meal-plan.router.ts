import { Router } from "express";
import { requireAuth, AuthenticatedRequest } from "../../auth/middleware/auth.middleware.js";
import { z } from "zod";
import { ok, handleError, badRequest, parseBody } from "../../../common/routing/helpers.js";
import { findUserBySubject } from "../../users/services/profile.service.js";
import { getRecipeDetails } from "../../recipes/services/recipes.service.js";
import {
  getMealPlanForUser,
  addRecipeToMealPlan,
  removeRecipeFromMealPlan,
  clearMealPlanForUser,
  saveAiRecipeToMealPlan
} from "../services/meal-plan.service.js";
import {
  getNotesForUser,
  upsertNote,
  deleteNote
} from "../services/note.service.js";

export const mealPlanRouter = Router();

/* ── GET /meal-plan ──────────────────────────── */

mealPlanRouter.get("/meal-plan", requireAuth, async (req, res) => {
  try {
    const { auth } = req as AuthenticatedRequest;
    const user = await findUserBySubject(auth.sub);
    if (!user) { badRequest(res, "User not found"); return; }
    
    const plan = await getMealPlanForUser(user.id);
    ok(res, plan);
  } catch (err) {
    handleError(res, err);
  }
});

/* ── POST /meal-plan/ai ──────────────────────── */

const aiRecipeSchema = z.object({
  title: z.string().min(1),
  servings: z.union([z.string(), z.number()]).optional(),
  estimatedTime: z.string().optional(),
  finalDish: z.string().optional(),
  imageUrl: z.string().optional(),
  instructions: z.array(z.string()).optional(),
  ingredients: z.array(z.object({
    name: z.string(),
    quantity: z.string().optional()
  })).optional()
});

mealPlanRouter.post("/meal-plan/ai", requireAuth, async (req, res) => {
  try {
    const { auth } = req as AuthenticatedRequest;
    const user = await findUserBySubject(auth.sub);
    if (!user) { badRequest(res, "User not found"); return; }
    
    const aiRecipe = parseBody(req.body, aiRecipeSchema);
    await saveAiRecipeToMealPlan(user.id, aiRecipe);
    
    ok(res, { success: true });
  } catch (err) {
    handleError(res, err);
  }
});

/* ── POST /meal-plan/:id ─────────────────────── */

mealPlanRouter.post("/meal-plan/:id", requireAuth, async (req, res) => {
  try {
    const { auth } = req as AuthenticatedRequest;
    const user = await findUserBySubject(auth.sub);
    if (!user) { badRequest(res, "User not found"); return; }
    
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { badRequest(res, "Invalid recipe ID"); return; }
    
    // Ensure the recipe exists in the database to prevent foreign key errors
    await getRecipeDetails(id);

    const date = req.body?.date as string | undefined;

    await addRecipeToMealPlan(user.id, id, date);
    ok(res, { success: true });
  } catch (err) {
    handleError(res, err);
  }
});

/* ── DELETE /meal-plan/:id ───────────────────── */

mealPlanRouter.delete("/meal-plan/:id", requireAuth, async (req, res) => {
  try {
    const { auth } = req as AuthenticatedRequest;
    const user = await findUserBySubject(auth.sub);
    if (!user) { badRequest(res, "User not found"); return; }
    
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { badRequest(res, "Invalid recipe ID"); return; }
    
    await removeRecipeFromMealPlan(user.id, id);
    ok(res, { success: true });
  } catch (err) {
    handleError(res, err);
  }
});

/* ── DELETE /meal-plan ───────────────────────── */

mealPlanRouter.delete("/meal-plan", requireAuth, async (req, res) => {
  try {
    const { auth } = req as AuthenticatedRequest;
    const user = await findUserBySubject(auth.sub);
    if (!user) { badRequest(res, "User not found"); return; }
    
    await clearMealPlanForUser(user.id);
    ok(res, { success: true });
  } catch (err) {
    handleError(res, err);
  }
});

/* ══════════════════════════════════════════════
   Planner Notes
   ══════════════════════════════════════════════ */

/* ── GET /planner-notes ─────────────────────── */

mealPlanRouter.get("/planner-notes", requireAuth, async (req, res) => {
  try {
    const { auth } = req as AuthenticatedRequest;
    const user = await findUserBySubject(auth.sub);
    if (!user) { badRequest(res, "User not found"); return; }

    const notes = await getNotesForUser(user.id);
    ok(res, notes);
  } catch (err) {
    handleError(res, err);
  }
});

/* ── PUT /planner-notes/:date ────────────────── */

const noteSchema = z.object({
  text: z.string().min(1),
});

mealPlanRouter.put("/planner-notes/:date", requireAuth, async (req, res) => {
  try {
    const { auth } = req as AuthenticatedRequest;
    const user = await findUserBySubject(auth.sub);
    if (!user) { badRequest(res, "User not found"); return; }

    const date = req.params.date; // YYYY-MM-DD
    const { text } = parseBody(req.body, noteSchema);

    await upsertNote(user.id, date, text);
    ok(res, { success: true });
  } catch (err) {
    handleError(res, err);
  }
});

/* ── DELETE /planner-notes/:date ──────────────── */

mealPlanRouter.delete("/planner-notes/:date", requireAuth, async (req, res) => {
  try {
    const { auth } = req as AuthenticatedRequest;
    const user = await findUserBySubject(auth.sub);
    if (!user) { badRequest(res, "User not found"); return; }

    const date = req.params.date;
    await deleteNote(user.id, date);
    ok(res, { success: true });
  } catch (err) {
    handleError(res, err);
  }
});
