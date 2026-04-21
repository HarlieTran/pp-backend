import { Router } from "express";
import { usersRouter } from "../../users/index.js";
import { onboardingRouter } from "../../onboarding/index.js";
import { pantryRouter } from "../../pantry/index.js";
import { recipesRouter } from "../../recipes/index.js";
import { mealPlanRouter } from "../../meal-plan/routes/meal-plan.router.js";

/**
 * Root API router — mounts all sub-routers.
 * All routes are prefixed with nothing here; the prefix
 * (e.g. /api) is applied in main.ts if desired.
 */
export const apiRouter = Router();

// Users: /health, /me/bootstrap, /me/profile
apiRouter.use(usersRouter);

// Onboarding: /onboarding/questions, /me/answers, /me/onboarding/complete
apiRouter.use(onboardingRouter);

// Pantry: /me/pantry, /me/pantry/:id, /me/pantry/upload-url, etc.
apiRouter.use(pantryRouter);

// Recipes: /recipes/suggestions, /recipes/search, /recipes/:id, etc.
apiRouter.use(recipesRouter);

// Meal Plan: /meal-plan, /meal-plan/:id
apiRouter.use(mealPlanRouter);
