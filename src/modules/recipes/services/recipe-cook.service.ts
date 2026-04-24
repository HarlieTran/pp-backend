import { deletePantryItem, getPantryItems, updatePantryItem } from "../../pantry/services/pantry.service.js";
import { getRecipeDetails } from "./recipes.service.js";
import { prisma } from "../../../common/db/prisma.js";

type CookOptions = {
  servingsUsed?: number;
  dryRun?: boolean;
};

export type CookRequestPayload = {
  recipeId?: number;
  ingredients?: Array<{ name: string; amount?: number; unit?: string }>;
  servingsUsed?: number;
  dryRun?: boolean;
};

type CookResult = {
  recipeId?: number;
  dryRun: boolean;
  updatedItems: Array<{ itemId: string; name: string; beforeQty: number; afterQty: number }>;
  removedItems: Array<{ itemId: string; name: string; beforeQty: number }>;
  unmatchedIngredients: string[];
  warnings: string[];
};

function normText(v: string) {
  return v.trim().toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ");
}

const NAME_STOPWORDS = new Set([
  "fresh", "chopped", "diced", "minced", "ground", "extra", "virgin",
  "organic", "large", "small", "medium", "boneless", "skinless",
  "unsalted", "salted", "reduced", "low", "fat", "to", "taste",
]);

function tokenizeName(v: string): string[] {
  return normText(v)
    .split(" ")
    .map((x) => x.trim())
    .filter((x) => x.length > 1 && !NAME_STOPWORDS.has(x));
}

function scoreNameMatch(ingredientName: string, pantryName: string): number {
  const a = normText(ingredientName);
  const b = normText(pantryName);
  if (!a || !b) return 0;
  if (a === b) return 100;
  if (a.includes(b) || b.includes(a)) return 70;

  const ta = tokenizeName(a);
  const tb = tokenizeName(b);
  if (ta.length === 0 || tb.length === 0) return 0;

  let overlap = 0;
  for (const token of ta) {
    if (tb.includes(token)) overlap += 1;
  }
  const ratio = overlap / Math.max(ta.length, tb.length);
  return Math.round(ratio * 60);
}

function normUnit(u?: string) {
  const x = (u ?? "").trim().toLowerCase();
  const map: Record<string, string> = {
    g: "g", gram: "g", grams: "g",
    kg: "kg", kilogram: "kg", kilograms: "kg",
    ml: "ml", milliliter: "ml", milliliters: "ml",
    l: "l", liter: "l", liters: "l",
    oz: "oz", ounce: "oz", ounces: "oz",
    lb: "lb", lbs: "lb", pound: "lb", pounds: "lb",
    tsp: "tsp", teaspoon: "tsp", teaspoons: "tsp",
    tbsp: "tbsp", tablespoon: "tbsp", tablespoons: "tbsp",
    cup: "cup", cups: "cup",
    pcs: "pcs", piece: "pcs", pieces: "pcs",
  };
  return map[x] ?? x;
}

function convertQty(qty: number, from: string, to: string): number | null {
  if (from === to) return qty;

  const mass: Record<string, number> = { g: 1, kg: 1000, oz: 28.3495, lb: 453.592 };
  const vol: Record<string, number> = { ml: 1, l: 1000, tsp: 4.92892, tbsp: 14.7868, cup: 236.588 };

  if (from in mass && to in mass) return (qty * mass[from]) / mass[to];
  if (from in vol && to in vol) return (qty * vol[from]) / vol[to];
  return null;
}

export async function cookRecipeForUser(
  userId: string,
  request: CookRequestPayload
): Promise<CookResult> {
  const dryRun = request.dryRun ?? false;
  const servingsUsed = request.servingsUsed ?? 1;

  const pantry = await getPantryItems(userId);
  let ingredientsToCook: Array<{ name: string; amount?: number; unit?: string }> = [];
  let factor = 1;

  if (request.recipeId) {
    const recipe: any = await getRecipeDetails(request.recipeId);
    if (!recipe) throw new Error("Recipe not found");
    
    factor = recipe.servings && recipe.servings > 0 ? servingsUsed / recipe.servings : servingsUsed;
    
    const ext = recipe.extendedIngredients ?? [];
    if (ext.length > 0) {
      ingredientsToCook = ext.map((ing: any) => ({
        name: ing.name ?? ing.original ?? "",
        amount: ing.amount,
        unit: ing.unit,
      }));
    } else if (recipe.ingredients) {
      // Fallback for AI generated recipes that only have ingredients
      ingredientsToCook = recipe.ingredients.map((ing: any) => ({
        name: ing.name ?? ing.rawName ?? "",
        amount: ing.amount,
        unit: ing.unit,
      }));
    }
  } else if (request.ingredients) {
    ingredientsToCook = request.ingredients;
    // For manual list, we assume factor is 1 because the user specifies the exact ingredients for their serving
    factor = 1; 
  } else {
    throw new Error("Must provide either recipeId or ingredients array");
  }

  const remaining = new Map(pantry.map((p) => [p.id, p.quantity]));
  const pantryById = new Map(pantry.map((p) => [p.id, p]));
  const deductions = new Map<string, number>();

  const unmatchedIngredients: string[] = [];
  const warnings: string[] = [];

  for (const ing of ingredientsToCook) {
    const ingName = normText(ing.name);
    if (!ingName) continue;

    const reqQtyRaw = (ing.amount ?? 1) * factor;
    const reqUnit = normUnit(ing.unit);
    
    const candidates = pantry
      .map((p) => {
        const pantryName = p.canonicalName || p.rawName;
        return { p, score: scoreNameMatch(ingName, pantryName) };
      })
      .filter((x) => x.score >= 30)
      .sort((x, y) => y.score - x.score)
      .map((x) => x.p);

    if (candidates.length === 0) {
      unmatchedIngredients.push(ing.name || "unknown");
      continue;
    }

    let matched = false;
    for (const c of candidates) {
      const pantryUnit = normUnit(c.unit);
      const available = remaining.get(c.id) ?? 0;
      if (available <= 0) continue;

      let needed = reqQtyRaw;
      if (reqUnit && pantryUnit && reqUnit !== pantryUnit) {
        const conv = convertQty(reqQtyRaw, reqUnit, pantryUnit);
        if (conv == null) {
          // Pragmatic fallback: if we have a unit mismatch but want pcs, or just consume 1 to be safe
          if (pantryUnit === "pcs" && reqQtyRaw > 0) {
            needed = Math.max(1, Math.round(reqQtyRaw));
          } else {
            // For now, if we cannot convert, assume we deduct 1 from whatever unit they have (best effort)
            needed = 1;
          }
        } else {
          needed = conv;
        }
      }

      const deduct = Math.min(available, needed);
      if (deduct <= 0) continue;

      remaining.set(c.id, available - deduct);
      deductions.set(c.id, (deductions.get(c.id) ?? 0) + deduct);
      matched = true;

      if (deduct < needed) {
        warnings.push(`Partial pantry coverage for "${ing.name}".`);
      }
      break;
    }

    if (!matched) {
      unmatchedIngredients.push(ing.name || "unknown");
    }
  }

  const updatedItems: CookResult["updatedItems"] = [];
  const removedItems: CookResult["removedItems"] = [];

  for (const [itemId, deductAmount] of deductions) {
    const p = pantryById.get(itemId);
    if (!p) continue;

    const beforeQty = p.quantity;
    const afterQty = remaining.get(itemId) ?? beforeQty;

    if (afterQty <= 0) {
      removedItems.push({ itemId, name: p.canonicalName || p.rawName, beforeQty });
      if (!dryRun) await deletePantryItem(userId, itemId);
    } else {
      updatedItems.push({ itemId, name: p.canonicalName || p.rawName, beforeQty, afterQty });
      if (!dryRun) await updatePantryItem(userId, itemId, { quantity: afterQty });
    }
  }

  return {
    recipeId: request.recipeId,
    dryRun,
    updatedItems,
    removedItems,
    unmatchedIngredients,
    warnings,
  };
}
