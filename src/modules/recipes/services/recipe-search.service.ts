import { prisma } from "../../../common/db/prisma.js";
import { getSavedRecipeIds } from "./recipe-save.service.js";

/* ──────────────────────────────────────────────
   searchRecipes
   Spec §4.4 — title ILIKE search, annotated with pantry
   match ratio, sorted: saved → pantryReady → alphabetical
   ────────────────────────────────────────────── */

export async function searchRecipes(query: string, userProfileId: string) {
  // 1. Search recipes by title (case-insensitive)
  const recipes = await prisma.recipe.findMany({
    where: {
      title: { contains: query, mode: "insensitive" },
    },
    take: 10,
    include: { ingredients: true },
  });

  // 2. Load pantry items → build canonicalName set
  const pantryItems = await prisma.pantryItem.findMany({
    where: { userProfileId },
  });
  const pantrySet = new Set(
    pantryItems.map((item) => (item.canonicalName || item.rawName).toLowerCase()),
  );

  // 3. Load saved recipe IDs
  const savedIds = new Set(await getSavedRecipeIds(userProfileId));

  // 4. Annotate each recipe with matchRatio and isPantryReady
  const annotated = recipes.map((recipe) => {
    const totalIngredients = recipe.ingredients.length;
    const matchedCount = recipe.ingredients.filter((ing) =>
      pantrySet.has(ing.canonicalName.toLowerCase()),
    ).length;

    const matchRatio = totalIngredients > 0 ? matchedCount / totalIngredients : 0;
    const isPantryReady = matchRatio >= 0.8;
    const isSaved = savedIds.has(recipe.id);

    return { ...recipe, matchRatio, isPantryReady, isSaved };
  });

  // 5. Sort: saved first → pantry-ready → alphabetical
  annotated.sort((a, b) => {
    if (a.isSaved !== b.isSaved) return a.isSaved ? -1 : 1;
    if (a.isPantryReady !== b.isPantryReady) return a.isPantryReady ? -1 : 1;
    return a.title.localeCompare(b.title);
  });

  return annotated;
}
