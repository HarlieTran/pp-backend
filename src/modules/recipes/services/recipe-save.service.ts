import { prisma } from "../../../common/db/prisma.js";

/* ──────────────────────────────────────────────
   toggleSaveRecipe — creates or deletes SavedRecipe row
   ────────────────────────────────────────────── */

export async function toggleSaveRecipe(userId: string, recipeId: number): Promise<{ saved: boolean }> {
  const existing = await prisma.savedRecipe.findUnique({
    where: { userId_recipeId: { userId, recipeId } },
  });

  if (existing) {
    await prisma.savedRecipe.delete({
      where: { id: existing.id },
    });
    return { saved: false };
  }

  await prisma.savedRecipe.create({
    data: { userId, recipeId },
  });
  return { saved: true };
}

/* ──────────────────────────────────────────────
   getSavedRecipeIds — returns array of saved recipe IDs
   ────────────────────────────────────────────── */

export async function getSavedRecipeIds(userId: string): Promise<number[]> {
  const saved = await prisma.savedRecipe.findMany({
    where: { userId },
    select: { recipeId: true },
  });

  return saved.map((s) => s.recipeId);
}

/* ──────────────────────────────────────────────
   getSavedRecipesForUser — returns full saved recipes
   ────────────────────────────────────────────── */

export async function getSavedRecipesForUser(userId: string) {
  const saved = await prisma.savedRecipe.findMany({
    where: { userId },
    include: {
      recipe: {
        select: {
          id: true,
          title: true,
          image: true,
          // Since the frontend uses FavoriteRecipe which needs id, title, image, imageType
          // We don't have explicit imageType in DB but it defaults to 'jpg' generally or we extract from image source URL
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  return saved.map(s => ({
    id: s.recipe.id,
    title: s.recipe.title,
    image: s.recipe.image,
    imageType: s.recipe.image ? s.recipe.image.split('.').pop() || 'jpg' : 'jpg'
  }));
}
