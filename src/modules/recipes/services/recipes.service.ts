import { Prisma } from "@prisma/client";
import { prisma } from "../../../common/db/prisma.js";
import { computeExpiryStatus } from "../../pantry/model/pantry.types.js";
import { findRecipesByIngredients, getRecipeInformation } from "./spoonacular.service.js";

/* ──────────────────────────────────────────────
   getRecipeSuggestionsForUser
   Spec §4.4 — pantry-based suggestions via Spoonacular,
   scored by expiry urgency + pantry match count
   ────────────────────────────────────────────── */

export async function getRecipeSuggestionsForUser(userProfileId: string, limit: number = 12) {
  // 1. Load pantry items
  const pantryItems = await prisma.pantryItem.findMany({
    where: { userProfileId },
  });

  // 2. Build deduplicated ingredient names
  const ingredientNames = Array.from(
    new Set(pantryItems.map((item) => item.canonicalName || item.rawName).filter(Boolean)),
  );

  // 3. If pantry is empty, return early
  if (ingredientNames.length === 0) {
    return { recipes: [] };
  }

  // 4. Call Spoonacular
  const spoonacularResults = await findRecipesByIngredients(ingredientNames, limit);

  // 5. Build a set of expiring-soon ingredient names
  const expiringSoonNames = new Set(
    pantryItems
      .filter((item) => {
        const { status } = computeExpiryStatus(item.expiryDate);
        return status === "expired" || status === "expiring_soon";
      })
      .map((item) => (item.canonicalName || item.rawName).toLowerCase()),
  );

  // 6. Score each recipe
  const scored = spoonacularResults.map((recipe) => {
    const usedNames = recipe.usedIngredients.map((ing) => ing.name.toLowerCase());
    const expiringSoonUsedCount = usedNames.filter((name) => expiringSoonNames.has(name)).length;

    const score =
      expiringSoonUsedCount * 5 +
      recipe.usedIngredientCount * 2 -
      recipe.missedIngredientCount * 1.5;

    return { ...recipe, score, expiringSoonUsedCount };
  });

  // 7. Sort descending by score
  scored.sort((a, b) => b.score - a.score);

  return { recipes: scored.slice(0, limit) };
}

/* ──────────────────────────────────────────────
   getRecipeDetails — DB first, falls back to Spoonacular
   ────────────────────────────────────────────── */

export async function getRecipeDetails(recipeId: number) {
  // Try DB first
  const cached = await prisma.recipe.findUnique({
    where: { id: recipeId },
  });

  if (cached && cached.rawData) return cached.rawData;

  // Fallback to Spoonacular
  const info = await getRecipeInformation(recipeId);

  // Lazily cache to Postgres
  await prisma.recipe.upsert({
    where: { id: info.id },
    update: {},
    create: {
      id: info.id,
      title: info.title,
      image: info.image ?? null,
      cuisine: info.cuisines ?? [],
      dietTags: info.diets ?? [],
      readyMinutes: info.readyInMinutes ?? null,
      servings: info.servings ?? null,
      sourceUrl: info.sourceUrl ?? null,
      summary: info.summary ?? null,
      instructions: info.instructions ? { html: info.instructions } : Prisma.JsonNull,
      rawData: JSON.parse(JSON.stringify(info)),
      ingredients: {
        create: (info.extendedIngredients ?? []).map((ing: any) => ({
          canonicalName: ing.name.toLowerCase(),
          rawName: ing.original,
          amount: ing.amount ?? null,
          unit: ing.unit ?? null,
        })),
      },
    },
  });

  return info;
}
