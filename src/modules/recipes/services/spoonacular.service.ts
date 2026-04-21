const SPOONACULAR_API_KEY = process.env.SPOONACULAR_API_KEY ?? "";
const SPOONACULAR_BASE_URL = "https://api.spoonacular.com";

/* ──────────────────────────────────────────────
   findRecipesByIngredients — Spoonacular API
   ────────────────────────────────────────────── */

export async function findRecipesByIngredients(ingredientNames: string[], limit: number) {
  if (!SPOONACULAR_API_KEY) {
    throw new Error("SPOONACULAR_API_KEY is not configured");
  }

  const url = new URL("/recipes/findByIngredients", SPOONACULAR_BASE_URL);
  url.searchParams.set("ingredients", ingredientNames.join(","));
  url.searchParams.set("number", String(limit));
  url.searchParams.set("ranking", "2"); // maximize used ingredients
  url.searchParams.set("ignorePantry", "true");
  url.searchParams.set("apiKey", SPOONACULAR_API_KEY);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Spoonacular error: ${response.status} ${await response.text()}`);
  }

  return response.json() as Promise<SpoonacularRecipeMatch[]>;
}

/* ──────────────────────────────────────────────
   getRecipeInformation — Spoonacular API
   ────────────────────────────────────────────── */

export async function getRecipeInformation(recipeId: number) {
  if (!SPOONACULAR_API_KEY) {
    throw new Error("SPOONACULAR_API_KEY is not configured");
  }

  const url = new URL(`/recipes/${recipeId}/information`, SPOONACULAR_BASE_URL);
  url.searchParams.set("includeNutrition", "false");
  url.searchParams.set("apiKey", SPOONACULAR_API_KEY);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Spoonacular error: ${response.status} ${await response.text()}`);
  }

  return response.json() as Promise<SpoonacularRecipeInfo>;
}

/* ──────────────────────────────────────────────
   Types
   ────────────────────────────────────────────── */

export interface SpoonacularIngredient {
  id: number;
  name: string;
  amount: number;
  unit: string;
  image: string;
}

export interface SpoonacularRecipeMatch {
  id: number;
  title: string;
  image: string;
  imageType: string;
  usedIngredientCount: number;
  missedIngredientCount: number;
  usedIngredients: SpoonacularIngredient[];
  missedIngredients: SpoonacularIngredient[];
  unusedIngredients: SpoonacularIngredient[];
  likes: number;
}

export interface SpoonacularRecipeInfo {
  id: number;
  title: string;
  image: string;
  readyInMinutes: number;
  servings: number;
  sourceUrl: string;
  summary: string;
  cuisines: string[];
  diets: string[];
  instructions: string;
  extendedIngredients: Array<{
    id: number;
    name: string;
    original: string;
    amount: number;
    unit: string;
  }>;
  [key: string]: unknown;
}
