import { PrismaClient, QuestionType, IngredientCategory } from "@prisma/client";

const prisma = new PrismaClient();

/* ──────────────────────────────────────────────
   Onboarding Questions + Options
   ────────────────────────────────────────────── */

const QUESTIONS = [
  {
    key: "dietary_preference",
    label: "Do you follow a specific diet?",
    type: QuestionType.SINGLE_CHOICE,
    isRequired: true,
    sortOrder: 1,
    options: [
      { value: "none", label: "No restrictions" },
      { value: "vegetarian", label: "Vegetarian" },
      { value: "vegan", label: "Vegan" },
      { value: "pescatarian", label: "Pescatarian" },
      { value: "keto", label: "Keto" },
      { value: "paleo", label: "Paleo" },
      { value: "gluten_free", label: "Gluten-Free" },
    ],
  },
  {
    key: "allergies",
    label: "Do you have any food allergies?",
    type: QuestionType.MULTI_CHOICE,
    isRequired: false,
    sortOrder: 2,
    options: [
      { value: "dairy", label: "Dairy" },
      { value: "eggs", label: "Eggs" },
      { value: "nuts", label: "Tree Nuts" },
      { value: "peanuts", label: "Peanuts" },
      { value: "shellfish", label: "Shellfish" },
      { value: "soy", label: "Soy" },
      { value: "gluten", label: "Gluten" },
      { value: "sesame", label: "Sesame" },
    ],
  },
  {
    key: "cooking_skill",
    label: "How would you rate your cooking skill?",
    type: QuestionType.SINGLE_CHOICE,
    isRequired: false,
    sortOrder: 3,
    options: [
      { value: "beginner", label: "Beginner" },
      { value: "intermediate", label: "Intermediate" },
      { value: "advanced", label: "Advanced" },
    ],
  },
  {
    key: "household_size",
    label: "How many people do you typically cook for?",
    type: QuestionType.SINGLE_CHOICE,
    isRequired: false,
    sortOrder: 4,
    options: [
      { value: "1", label: "Just me" },
      { value: "2", label: "2 people" },
      { value: "3-4", label: "3–4 people" },
      { value: "5+", label: "5 or more" },
    ],
  },
  {
    key: "goals",
    label: "What are your cooking goals?",
    type: QuestionType.MULTI_CHOICE,
    isRequired: false,
    sortOrder: 5,
    options: [
      { value: "reduce_waste", label: "Reduce food waste" },
      { value: "save_money", label: "Save money on groceries" },
      { value: "eat_healthier", label: "Eat healthier" },
      { value: "try_new", label: "Try new recipes" },
      { value: "meal_prep", label: "Meal prep efficiently" },
    ],
  },
  {
    key: "dislikes",
    label: "Any foods you dislike?",
    type: QuestionType.FREE_TEXT,
    isRequired: false,
    sortOrder: 6,
    options: [],
  },
];

/* ──────────────────────────────────────────────
   Common Ingredients (canonical name → category)
   ────────────────────────────────────────────── */

const INGREDIENTS: Array<{
  canonicalName: string;
  category: IngredientCategory;
  aliases: string[];
}> = [
  // Produce
  { canonicalName: "apple", category: "produce", aliases: ["apples", "gala apple", "fuji apple", "granny smith"] },
  { canonicalName: "banana", category: "produce", aliases: ["bananas"] },
  { canonicalName: "tomato", category: "produce", aliases: ["tomatoes", "roma tomato", "cherry tomato"] },
  { canonicalName: "onion", category: "produce", aliases: ["onions", "yellow onion", "white onion", "red onion"] },
  { canonicalName: "garlic", category: "produce", aliases: ["garlic cloves", "minced garlic"] },
  { canonicalName: "potato", category: "produce", aliases: ["potatoes", "russet potato", "yukon gold"] },
  { canonicalName: "carrot", category: "produce", aliases: ["carrots"] },
  { canonicalName: "broccoli", category: "produce", aliases: [] },
  { canonicalName: "spinach", category: "produce", aliases: ["baby spinach"] },
  { canonicalName: "lettuce", category: "produce", aliases: ["romaine lettuce", "iceberg lettuce"] },
  { canonicalName: "bell pepper", category: "produce", aliases: ["bell peppers", "green pepper", "red pepper", "yellow pepper"] },
  { canonicalName: "cucumber", category: "produce", aliases: ["cucumbers"] },
  { canonicalName: "lemon", category: "produce", aliases: ["lemons"] },
  { canonicalName: "lime", category: "produce", aliases: ["limes"] },
  { canonicalName: "avocado", category: "produce", aliases: ["avocados"] },
  { canonicalName: "mushroom", category: "produce", aliases: ["mushrooms", "button mushroom", "portobello"] },
  { canonicalName: "celery", category: "produce", aliases: ["celery stalks"] },
  { canonicalName: "ginger", category: "produce", aliases: ["fresh ginger", "ginger root"] },
  { canonicalName: "corn", category: "produce", aliases: ["sweet corn", "corn on the cob"] },
  { canonicalName: "zucchini", category: "produce", aliases: ["zucchinis"] },

  // Dairy
  { canonicalName: "milk", category: "dairy", aliases: ["whole milk", "2% milk", "skim milk"] },
  { canonicalName: "butter", category: "dairy", aliases: ["unsalted butter", "salted butter"] },
  { canonicalName: "cheese", category: "dairy", aliases: ["cheddar", "mozzarella", "parmesan", "swiss cheese"] },
  { canonicalName: "yogurt", category: "dairy", aliases: ["greek yogurt", "plain yogurt"] },
  { canonicalName: "cream", category: "dairy", aliases: ["heavy cream", "whipping cream", "sour cream"] },
  { canonicalName: "eggs", category: "dairy", aliases: ["egg", "large eggs"] },

  // Meat
  { canonicalName: "chicken breast", category: "meat", aliases: ["boneless chicken breast", "chicken breasts"] },
  { canonicalName: "chicken thigh", category: "meat", aliases: ["chicken thighs", "bone-in chicken thigh"] },
  { canonicalName: "ground beef", category: "meat", aliases: ["ground chuck", "minced beef", "hamburger meat"] },
  { canonicalName: "bacon", category: "meat", aliases: ["turkey bacon", "pork bacon"] },
  { canonicalName: "pork chop", category: "meat", aliases: ["pork chops"] },
  { canonicalName: "sausage", category: "meat", aliases: ["italian sausage", "breakfast sausage"] },
  { canonicalName: "steak", category: "meat", aliases: ["beef steak", "ribeye", "sirloin"] },

  // Seafood
  { canonicalName: "salmon", category: "seafood", aliases: ["salmon fillet", "atlantic salmon"] },
  { canonicalName: "shrimp", category: "seafood", aliases: ["prawns", "large shrimp"] },
  { canonicalName: "tuna", category: "seafood", aliases: ["canned tuna", "tuna steak"] },

  // Grains
  { canonicalName: "rice", category: "grains", aliases: ["white rice", "brown rice", "jasmine rice", "basmati rice"] },
  { canonicalName: "pasta", category: "grains", aliases: ["spaghetti", "penne", "fusilli", "macaroni"] },
  { canonicalName: "bread", category: "grains", aliases: ["white bread", "wheat bread", "sourdough"] },
  { canonicalName: "flour", category: "grains", aliases: ["all-purpose flour", "wheat flour", "self-rising flour"] },
  { canonicalName: "oats", category: "grains", aliases: ["rolled oats", "oatmeal", "steel cut oats"] },
  { canonicalName: "quinoa", category: "grains", aliases: [] },
  { canonicalName: "tortilla", category: "grains", aliases: ["tortillas", "flour tortilla", "corn tortilla"] },

  // Spices
  { canonicalName: "salt", category: "spices", aliases: ["sea salt", "table salt", "kosher salt"] },
  { canonicalName: "black pepper", category: "spices", aliases: ["pepper", "ground black pepper"] },
  { canonicalName: "cumin", category: "spices", aliases: ["ground cumin"] },
  { canonicalName: "paprika", category: "spices", aliases: ["smoked paprika", "sweet paprika"] },
  { canonicalName: "cinnamon", category: "spices", aliases: ["ground cinnamon"] },
  { canonicalName: "oregano", category: "spices", aliases: ["dried oregano"] },
  { canonicalName: "basil", category: "spices", aliases: ["fresh basil", "dried basil"] },
  { canonicalName: "chili powder", category: "spices", aliases: ["chili flakes", "red pepper flakes"] },
  { canonicalName: "turmeric", category: "spices", aliases: ["ground turmeric"] },
  { canonicalName: "thyme", category: "spices", aliases: ["fresh thyme", "dried thyme"] },

  // Condiments
  { canonicalName: "olive oil", category: "condiments", aliases: ["extra virgin olive oil", "evoo"] },
  { canonicalName: "soy sauce", category: "condiments", aliases: ["light soy sauce", "dark soy sauce"] },
  { canonicalName: "vinegar", category: "condiments", aliases: ["white vinegar", "apple cider vinegar", "balsamic vinegar"] },
  { canonicalName: "ketchup", category: "condiments", aliases: ["catsup"] },
  { canonicalName: "mustard", category: "condiments", aliases: ["yellow mustard", "dijon mustard"] },
  { canonicalName: "mayonnaise", category: "condiments", aliases: ["mayo"] },
  { canonicalName: "honey", category: "condiments", aliases: [] },
  { canonicalName: "sugar", category: "condiments", aliases: ["white sugar", "granulated sugar", "brown sugar"] },

  // Frozen
  { canonicalName: "frozen vegetables", category: "frozen", aliases: ["mixed vegetables", "frozen mixed veggies"] },
  { canonicalName: "ice cream", category: "frozen", aliases: ["vanilla ice cream"] },
  { canonicalName: "frozen berries", category: "frozen", aliases: ["frozen blueberries", "frozen strawberries"] },

  // Beverages
  { canonicalName: "coffee", category: "beverages", aliases: ["ground coffee", "coffee beans"] },
  { canonicalName: "tea", category: "beverages", aliases: ["green tea", "black tea", "herbal tea"] },
  { canonicalName: "orange juice", category: "beverages", aliases: ["oj"] },

  // Snacks
  { canonicalName: "chips", category: "snacks", aliases: ["potato chips", "tortilla chips"] },
  { canonicalName: "crackers", category: "snacks", aliases: ["saltine crackers", "graham crackers"] },
  { canonicalName: "peanut butter", category: "snacks", aliases: ["creamy peanut butter", "crunchy peanut butter"] },

  // Other
  { canonicalName: "canned beans", category: "other", aliases: ["black beans", "kidney beans", "chickpeas", "garbanzo beans"] },
  { canonicalName: "coconut milk", category: "other", aliases: ["canned coconut milk"] },
  { canonicalName: "broth", category: "other", aliases: ["chicken broth", "beef broth", "vegetable broth", "stock"] },
  { canonicalName: "tomato sauce", category: "other", aliases: ["marinara", "pasta sauce", "tomato paste"] },
];

/* ──────────────────────────────────────────────
   Seed Runner
   ────────────────────────────────────────────── */

async function main() {
  console.log("🌱 Seeding onboarding questions …");

  for (const q of QUESTIONS) {
    const question = await prisma.question.upsert({
      where: { key: q.key },
      update: { label: q.label, type: q.type, isRequired: q.isRequired, sortOrder: q.sortOrder },
      create: { key: q.key, label: q.label, type: q.type, isRequired: q.isRequired, sortOrder: q.sortOrder },
    });

    for (let i = 0; i < q.options.length; i++) {
      const opt = q.options[i];
      await prisma.questionOption.upsert({
        where: { questionId_value: { questionId: question.id, value: opt.value } },
        update: { label: opt.label, sortOrder: i },
        create: { questionId: question.id, value: opt.value, label: opt.label, sortOrder: i },
      });
    }
  }

  console.log("🌱 Seeding ingredients …");

  for (const ing of INGREDIENTS) {
    await prisma.ingredient.upsert({
      where: { canonicalName: ing.canonicalName },
      update: { aliases: ing.aliases, category: ing.category },
      create: { canonicalName: ing.canonicalName, aliases: ing.aliases, category: ing.category },
    });
  }

  console.log("✅ Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
