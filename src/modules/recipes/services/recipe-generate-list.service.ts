import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { stripCodeFence } from "../../../common/ai/bedrock.js";

const AWS_REGION = process.env.AWS_REGION ?? "us-east-2";
const BEDROCK_MODEL_ID = process.env.BEDROCK_MODEL_ID ?? "amazon.nova-lite-v1:0";

const bedrockClient = new BedrockRuntimeClient({ region: AWS_REGION });

export async function generateAiRecipeList(ingredients: { name: string; quantity?: string }[]) {
  const cleanedIngredients = ingredients
    .filter(i => i.name && i.name.trim().length > 0)
    .map(i => ({
      name: i.name.trim(),
      quantity: i.quantity?.trim() || "unknown",
    }));

  if (cleanedIngredients.length === 0) {
    throw new Error("ingredients array is required.");
  }

  const prompt = [
    "You are a chef assistant. Create EXACTLY 3 recipe suggestions using pantry items.",
    "Return ONLY valid JSON (no markdown, no explanation).",
    "Schema:",
    '{"recipes":[{"title":"string","servings":"string","estimatedTime":"string","ingredients":[{"name":"string","quantity":"string","fromPantry":true}],"instructions":["string"],"finalDish":"string"}]}',
    "Rules:",
    "1) Rank recipes by pantry usage from highest to lowest.",
    "2) Mark each ingredient with fromPantry=true/false.",
    "3) instructions must be clear, ordered, and practical.",
    "4) finalDish should describe what the finished plate looks/tastes like.",
    '5) Keep estimatedTime concise (e.g. "25 mins"), servings concise (e.g. "2").',
    `Pantry input: ${JSON.stringify(cleanedIngredients)}`,
  ].join("\n");

  const command = new ConverseCommand({
    modelId: BEDROCK_MODEL_ID,
    messages: [
      {
        role: "user",
        content: [{ text: prompt }],
      },
    ],
    inferenceConfig: {
      maxTokens: 1800,
      temperature: 0.4,
    },
  });

  const bedrockRes = await bedrockClient.send(command);
  const text = bedrockRes.output?.message?.content?.find((block) => "text" in block)?.text ?? "";
  if (!text) {
    throw new Error("AWS Bedrock returned empty text response.");
  }

  const cleanedText = stripCodeFence(text);
  const parsed = JSON.parse(cleanedText);
  return Array.isArray(parsed.recipes) ? parsed.recipes : [];
}
