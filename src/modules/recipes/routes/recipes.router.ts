import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthenticatedRequest } from "../../auth/index.js";
import { ok, handleError, parseBody, badRequest, notFound } from "../../../common/routing/helpers.js";
import { findUserBySubject } from "../../users/services/profile.service.js";
import { getRecipeSuggestionsForUser, getRecipeDetails } from "../services/recipes.service.js";
import { getSavedRecipesForUser } from "../services/recipe-save.service.js";
import { generateAndSaveRecipe, generateAiImageForRecipe } from "../services/recipe-generate.service.js";
import { generateAiRecipeList } from "../services/recipe-generate-list.service.js";
import { toggleSaveRecipe } from "../services/recipe-save.service.js";
import { searchRecipes } from "../services/recipe-search.service.js";
import { cookRecipeForUser } from "../services/recipe-cook.service.js";

export const recipesRouter = Router();

/* ── GET /recipes/saved ─────────────────────── */

recipesRouter.get("/recipes/saved", requireAuth, async (req, res) => {
  try {
    const { auth } = req as AuthenticatedRequest;
    const user = await findUserBySubject(auth.sub);
    if (!user) { badRequest(res, "User not found"); return; }
    const recipes = await getSavedRecipesForUser(user.id);
    ok(res, recipes);
  } catch (err) {
    handleError(res, err);
  }
});

/* ── POST /recipes/suggestions ───────────────── */

const suggestionsSchema = z.object({
  limit: z.number().int().min(1).max(30).optional().default(12),
});

recipesRouter.post("/recipes/suggestions", requireAuth, async (req, res) => {
  try {
    const { auth } = req as AuthenticatedRequest;
    const user = await findUserBySubject(auth.sub);
    if (!user) { badRequest(res, "User not found"); return; }
    const { limit } = parseBody(req.body, suggestionsSchema);
    const result = await getRecipeSuggestionsForUser(user.id, limit);
    ok(res, result);
  } catch (err) {
    handleError(res, err);
  }
});

/* ── GET /recipes/search?q= ──────────────────── */

recipesRouter.get("/recipes/search", requireAuth, async (req, res) => {
  try {
    const { auth } = req as AuthenticatedRequest;
    const user = await findUserBySubject(auth.sub);
    if (!user) { badRequest(res, "User not found"); return; }
    const q = typeof req.query.q === "string" ? req.query.q : "";
    if (!q) { badRequest(res, "Query parameter 'q' is required"); return; }
    const recipes = await searchRecipes(q, user.id);
    ok(res, { recipes });
  } catch (err) {
    handleError(res, err);
  }
});

/* ── GET /recipes/:id ────────────────────────── */

recipesRouter.get("/recipes/:id", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { badRequest(res, "Invalid recipe ID"); return; }
    const recipe = await getRecipeDetails(id);
    if (!recipe) { notFound(res); return; }
    ok(res, recipe);
  } catch (err) {
    handleError(res, err);
  }
});

/* ── POST /recipes/from-name ─────────────────── */

const fromNameSchema = z.object({
  name: z.string().min(1).max(200),
  targetServings: z.number().int().min(1).max(20).optional().default(4),
});

recipesRouter.post("/recipes/from-name", requireAuth, async (req, res) => {
  try {
    const { name, targetServings } = parseBody(req.body, fromNameSchema);
    const recipe = await generateAndSaveRecipe(name, targetServings);
    ok(res, recipe);
  } catch (err) {
    handleError(res, err);
  }
});

/* ── POST /recipes/generate-list ──────────────── */

const generateListSchema = z.object({
  ingredients: z.array(z.object({
    name: z.string(),
    quantity: z.string().optional()
  })).optional()
});

recipesRouter.post("/recipes/generate-list", requireAuth, async (req, res) => {
  try {
    const { ingredients } = parseBody(req.body, generateListSchema);
    const recipes = await generateAiRecipeList(ingredients || []);
    ok(res, { recipes });
  } catch (err) {
    handleError(res, err);
  }
});

/* ── POST /recipes/generate-image ────────────── */

const generateImageSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(500),
});

recipesRouter.post("/recipes/generate-image", requireAuth, async (req, res) => {
  try {
    const { title, description } = parseBody(req.body, generateImageSchema);
    const imageUrl = await generateAiImageForRecipe(title, description);
    ok(res, { imageUrl });
  } catch (err) {
    handleError(res, err);
  }
});

/* ── POST /recipes/:id/save ──────────────────── */

recipesRouter.post("/recipes/:id/save", requireAuth, async (req, res) => {
  try {
    const { auth } = req as AuthenticatedRequest;
    const user = await findUserBySubject(auth.sub);
    if (!user) { badRequest(res, "User not found"); return; }
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { badRequest(res, "Invalid recipe ID"); return; }
    
    // Ensure the recipe exists in the database to prevent foreign key errors
    await getRecipeDetails(id);

    const result = await toggleSaveRecipe(user.id, id);
    ok(res, result);
  } catch (err) {
    handleError(res, err);
  }
});

/* ── POST /recipes/cook ──────────────────────── */

const cookSchema = z.object({
  recipeId: z.number().int().positive().optional(),
  ingredients: z.array(z.object({
    name: z.string(),
    amount: z.number().optional(),
    unit: z.string().optional()
  })).optional(),
  servingsUsed: z.number().positive().optional(),
  dryRun: z.boolean().optional()
});

recipesRouter.post("/recipes/cook", requireAuth, async (req, res) => {
  try {
    const { auth } = req as AuthenticatedRequest;
    const user = await findUserBySubject(auth.sub);
    if (!user) { badRequest(res, "User not found"); return; }
    
    const payload = parseBody(req.body, cookSchema);
    if (!payload.recipeId && (!payload.ingredients || payload.ingredients.length === 0)) {
      badRequest(res, "Must provide either recipeId or ingredients array");
      return;
    }
    
    const result = await cookRecipeForUser(user.id, payload);
    ok(res, result);
  } catch (err) {
    handleError(res, err);
  }
});
