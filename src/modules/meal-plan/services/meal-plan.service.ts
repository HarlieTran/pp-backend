import { prisma } from "../../../common/db/prisma.js";

/* ──────────────────────────────────────────────
   getMealPlanForUser — returns all planned recipes
   ────────────────────────────────────────────── */

export async function getMealPlanForUser(userId: string) {
  const items = await prisma.mealPlanItem.findMany({
    where: { userId },
    include: {
      recipe: {
        include: {
          ingredients: true
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  return items.map(item => {
    const r = item.recipe;
    // Map recipe into the format expected by the frontend's PlannedRecipe
    return {
      id: String(r.id),
      title: r.title,
      image: r.image ?? "",
      sourceType: r.id > 1500000000 ? "ai" : "spoonacular",
      date: item.date,
      requiredIngredients: r.ingredients.map(ing => ({
        name: ing.canonicalName,
        quantity: ing.amount ? `${ing.amount} ${ing.unit || ""}`.trim() : ""
      }))
    };
  });
}

/* ──────────────────────────────────────────────
   addRecipeToMealPlan — creates a MealPlanItem
   ────────────────────────────────────────────── */

export async function addRecipeToMealPlan(userId: string, recipeId: number, date?: string) {
  const existing = await prisma.mealPlanItem.findUnique({
    where: { userId_recipeId: { userId, recipeId } },
  });

  if (existing) {
    if (date !== undefined) {
      return await prisma.mealPlanItem.update({
        where: { id: existing.id },
        data: { date }
      });
    }
    return existing;
  }

  return await prisma.mealPlanItem.create({
    data: { userId, recipeId, date },
  });
}
/* ──────────────────────────────────────────────
   saveAiRecipeToMealPlan — creates Recipe then MealPlanItem
   ────────────────────────────────────────────── */

export async function saveAiRecipeToMealPlan(userId: string, aiRecipe: any) {
  let existingRecipe = await prisma.recipe.findFirst({
    where: { title: { equals: aiRecipe.title, mode: "insensitive" } },
  });

  if (!existingRecipe) {
    const recipeId = Math.floor(1_500_000_000 + Math.random() * 600_000_000);
    existingRecipe = await prisma.recipe.create({
      data: {
        id: recipeId,
        title: aiRecipe.title,
        image: aiRecipe.imageUrl || null,
        cuisine: [],
        dietTags: [],
        readyMinutes: parseInt(aiRecipe.estimatedTime) || null,
        servings: parseInt(aiRecipe.servings) || 4,
        summary: aiRecipe.finalDish || null,
        instructions: { steps: aiRecipe.instructions || [] },
        rawData: aiRecipe,
        ingredients: {
          create: (Array.isArray(aiRecipe.ingredients) ? aiRecipe.ingredients : []).map(
            (ing: any) => ({
              canonicalName: ing.name.toLowerCase(),
              rawName: ing.name,
              amount: parseFloat(ing.quantity) || null,
              unit: ing.quantity?.replace(/[\d\.\s]/g, '') || null,
            }),
          ),
        },
      },
    });
  }

  return await addRecipeToMealPlan(userId, existingRecipe.id);
}
/* ──────────────────────────────────────────────
   removeRecipeFromMealPlan — deletes a MealPlanItem
   ────────────────────────────────────────────── */

export async function removeRecipeFromMealPlan(userId: string, recipeId: number) {
  const existing = await prisma.mealPlanItem.findUnique({
    where: { userId_recipeId: { userId, recipeId } },
  });

  if (existing) {
    await prisma.mealPlanItem.delete({
      where: { id: existing.id },
    });
  }
}

/* ──────────────────────────────────────────────
   clearMealPlanForUser — deletes all for user
   ────────────────────────────────────────────── */

export async function clearMealPlanForUser(userId: string) {
  await prisma.mealPlanItem.deleteMany({
    where: { userId }
  });
}
