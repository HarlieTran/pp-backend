import { prisma } from "./src/common/db/prisma.js";

async function run() {
  const r = await prisma.recipe.findFirst({
    where: { title: { contains: "Stuffed Lemons in the Oven" } },
    include: { ingredients: true }
  });
  console.log(JSON.stringify({
    rawExtended: (r?.rawData as any)?.extendedIngredients?.length,
    dbIngredients: r?.ingredients?.length,
    rawIngs: (r?.rawData as any)?.extendedIngredients?.map((i: any) => i.name),
    dbIngs: r?.ingredients?.map(i => i.canonicalName)
  }, null, 2));
}

run().then(() => process.exit(0));
