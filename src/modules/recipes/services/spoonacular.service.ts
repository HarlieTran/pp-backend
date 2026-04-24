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

  const data = await response.json() as SpoonacularRecipeMatch[];
  return data.map(recipe => ({
    ...recipe,
    image: upgradeImageUrl(recipe.image)
  }));
}

/* ──────────────────────────────────────────────
   findRecipesComplex — Spoonacular API
   ────────────────────────────────────────────── */

export async function findRecipesComplex(ingredientNames: string[], limit: number, filter?: string) {
  if (!SPOONACULAR_API_KEY) {
    throw new Error("SPOONACULAR_API_KEY is not configured");
  }

  const url = new URL("/recipes/complexSearch", SPOONACULAR_BASE_URL);
  url.searchParams.set("includeIngredients", ingredientNames.join(","));
  // Ask for more so we can filter if needed
  url.searchParams.set("number", String(limit * 2)); 
  url.searchParams.set("fillIngredients", "true");
  url.searchParams.set("addRecipeInformation", "true");
  url.searchParams.set("ignorePantry", "true");
  url.searchParams.set("apiKey", SPOONACULAR_API_KEY);

  if (filter === "Ready to cook") {
    url.searchParams.set("sort", "min-missing-ingredients");
  } else {
    url.searchParams.set("sort", "max-used-ingredients");
  }

  if (filter === "Quick eats") {
    url.searchParams.set("maxReadyTime", "30");
  } else if (filter === "High protein") {
    url.searchParams.set("minProtein", "20");
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Spoonacular error: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  const results = data.results as SpoonacularRecipeMatch[];
  return results.map(recipe => ({
    ...recipe,
    image: upgradeImageUrl(recipe.image)
  }));
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

  const data = await response.json() as SpoonacularRecipeInfo;
  if (data.image) {
    data.image = upgradeImageUrl(data.image);
  }
  return data;
}

/* ──────────────────────────────────────────────
   Helpers
   ────────────────────────────────────────────── */

function upgradeImageUrl(url: string): string;
function upgradeImageUrl(url: string | undefined | null): string | undefined | null;
function upgradeImageUrl(url: string | undefined | null) {
  if (!url) return url;
  return url.replace(/-\d+x\d+/, '-636x393');
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
