import { prisma } from "../../../common/db/prisma.js";

/**
 * Attempts to match a raw ingredient name against the Ingredient lookup table.
 * Returns the canonical name and category if found, otherwise normalises the raw name.
 */
export async function matchIngredient(rawName: string): Promise<{
  canonicalName: string;
  category: string;
  ingredientId: string | null;
}> {
  const normalised = rawName.trim().toLowerCase();

  // 1) Exact canonical match
  const exact = await prisma.ingredient.findFirst({
    where: { canonicalName: normalised, isActive: true },
  });
  if (exact) {
    return { canonicalName: exact.canonicalName, category: exact.category ?? "other", ingredientId: exact.id };
  }

  // 2) Search aliases (stored as JSON string array)
  const allIngredients = await prisma.ingredient.findMany({
    where: { isActive: true },
  });

  for (const ing of allIngredients) {
    const aliases = Array.isArray(ing.aliases) ? (ing.aliases as string[]) : [];
    const match = aliases.some((alias) => alias.toLowerCase() === normalised);
    if (match) {
      return { canonicalName: ing.canonicalName, category: ing.category ?? "other", ingredientId: ing.id };
    }
  }

  // 3) Partial / substring match on canonical name
  const partial = allIngredients.find(
    (ing) => normalised.includes(ing.canonicalName) || ing.canonicalName.includes(normalised),
  );
  if (partial) {
    return { canonicalName: partial.canonicalName, category: partial.category ?? "other", ingredientId: partial.id };
  }

  // 4) No match — use raw name as canonical
  return { canonicalName: normalised, category: "other", ingredientId: null };
}
