import { PutObjectCommand } from "@aws-sdk/client-s3";
import { BedrockRuntimeClient, ConverseCommand, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { Prisma } from "@prisma/client";
import { prisma } from "../../../common/db/prisma.js";
import { s3 } from "../../../common/storage/s3.js";
import { stripCodeFence } from "../../../common/ai/bedrock.js";

const AWS_REGION = process.env.AWS_REGION ?? "us-east-2";
const BEDROCK_MODEL_ID = process.env.BEDROCK_MODEL_ID ?? "amazon.nova-lite-v1:0";
const TITAN_MODEL_ID = process.env.TITAN_MODEL_ID ?? "amazon.titan-image-generator-v1";
const S3_BUCKET_RECIPE_CACHE = process.env.S3_BUCKET_RECIPE_CACHE ?? "";
const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY ?? "";

const bedrockClient = new BedrockRuntimeClient({ region: AWS_REGION });

export async function generateAiImageForRecipe(title: string, description: string): Promise<string | null> {
  // 1. Try Unsplash for instant, high-quality food photography
  if (UNSPLASH_ACCESS_KEY) {
    try {
      const unsplashUrl = new URL("https://api.unsplash.com/search/photos");
      unsplashUrl.searchParams.set("query", title);
      unsplashUrl.searchParams.set("per_page", "1");
      unsplashUrl.searchParams.set("orientation", "landscape");

      const unsplashRes = await fetch(unsplashUrl, {
        headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}` },
      });

      if (unsplashRes.ok) {
        const unsplashData = await unsplashRes.json() as { results: Array<{ urls: { regular: string } }> };
        const photo = unsplashData.results?.[0];
        if (photo && photo.urls && photo.urls.regular) {
          // For ephemeral AI recipes, returning the Unsplash URL directly is the fastest.
          return photo.urls.regular;
        }
      }
    } catch (err) {
      console.error("Unsplash search failed, falling back to Titan:", err);
    }
  }

  // 2. Fallback to AWS Titan Image Generator
  if (!S3_BUCKET_RECIPE_CACHE) return null;

  try {
    const prompt = `A professional, appetizing food photography shot of ${title}. ${description}. High resolution, beautiful plating, natural lighting, photorealistic.`;
    
    const payload = {
      taskType: "TEXT_IMAGE",
      textToImageParams: {
        text: prompt,
      },
      imageGenerationConfig: {
        numberOfImages: 1,
        height: 512,
        width: 512,
        cfgScale: 8.0,
      }
    };

    const command = new InvokeModelCommand({
      modelId: TITAN_MODEL_ID,
      contentType: "application/json",
      accept: "application/json",
      body: Buffer.from(JSON.stringify(payload)),
    });

    const res = await bedrockClient.send(command);
    const bodyStr = Buffer.from(res.body).toString("utf-8");
    const bodyObj = JSON.parse(bodyStr);
    
    const base64Image = bodyObj.images?.[0];
    if (!base64Image) return null;

    const imageBuffer = Buffer.from(base64Image, "base64");
    
    const imageId = Math.random().toString(36).substring(2, 15);
    const s3Key = `recipe-images/ai-${imageId}.jpg`;
    
    await s3.send(
      new PutObjectCommand({
        Bucket: S3_BUCKET_RECIPE_CACHE,
        Key: s3Key,
        Body: imageBuffer,
        ContentType: "image/jpeg",
      }),
    );

    return `https://${S3_BUCKET_RECIPE_CACHE}.s3.${AWS_REGION}.amazonaws.com/${s3Key}`;
  } catch (err) {
    console.error("Failed to generate AI image:", err);
    return null;
  }
}

/* ──────────────────────────────────────────────
   generateAndSaveRecipe
   Spec §4.4 — Bedrock generates recipe JSON, saves to
   Postgres + S3 image with Unsplash fallback
   ────────────────────────────────────────────── */

export async function generateAndSaveRecipe(name: string, targetServings: number = 4) {
  // 1. Check for existing recipe by title (case-insensitive)
  const existing = await prisma.recipe.findFirst({
    where: { title: { equals: name, mode: "insensitive" } },
    include: { ingredients: true },
  });
  if (existing) return existing;

  // 2. Call Bedrock Nova Lite
  const prompt = [
    `Generate a detailed recipe for "${name}" that serves ${targetServings}.`,
    "Return ONLY valid JSON (no markdown, no explanation).",
    "Schema:",
    '{"title":"string","cuisine":["string"],"dietTags":["string"],"readyMinutes":number,"servings":number,"summary":"string","instructions":["string"],"ingredients":[{"name":"string","amount":number,"unit":"string"}]}',
    "Rules:",
    "1) title should be the proper recipe name.",
    "2) instructions must be clear, ordered, and practical steps.",
    "3) ingredients should list all required ingredients with amounts.",
    "4) cuisine and dietTags should be accurate classifications.",
  ].join("\n");

  const command = new ConverseCommand({
    modelId: BEDROCK_MODEL_ID,
    messages: [{ role: "user", content: [{ text: prompt }] }],
    inferenceConfig: { maxTokens: 1500, temperature: 0.3 },
  });

  const bedrockRes = await bedrockClient.send(command);
  const text = bedrockRes.output?.message?.content?.find((block) => "text" in block)?.text ?? "";
  if (!text) throw new Error("Bedrock returned empty response");

  // 3. Parse the AI output
  const cleaned = stripCodeFence(text);
  const parsed = JSON.parse(cleaned);

  // 4. Generate a unique ID in the 1.5B–2.1B range
  const recipeId = Math.floor(1_500_000_000 + Math.random() * 600_000_000);

  // 5. Fetch image from Unsplash (optional)
  let imageUrl: string | null = null;
  let imageSourceUrl: string | null = null;

  if (UNSPLASH_ACCESS_KEY) {
    try {
      const unsplashUrl = new URL("https://api.unsplash.com/search/photos");
      unsplashUrl.searchParams.set("query", parsed.title || name);
      unsplashUrl.searchParams.set("per_page", "1");
      unsplashUrl.searchParams.set("orientation", "landscape");

      const unsplashRes = await fetch(unsplashUrl, {
        headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}` },
      });

      if (unsplashRes.ok) {
        const unsplashData = await unsplashRes.json() as { results: Array<{ urls: { regular: string }; links: { html: string } }> };
        const photo = unsplashData.results?.[0];
        if (photo) {
          imageSourceUrl = photo.links.html;

          // Upload to S3 if bucket configured
          if (S3_BUCKET_RECIPE_CACHE) {
            const imageRes = await fetch(photo.urls.regular);
            const imageBuffer = Buffer.from(await imageRes.arrayBuffer());

            const s3Key = `recipe-images/${recipeId}.jpg`;
            await s3.send(
              new PutObjectCommand({
                Bucket: S3_BUCKET_RECIPE_CACHE,
                Key: s3Key,
                Body: imageBuffer,
                ContentType: "image/jpeg",
              }),
            );

            imageUrl = `https://${S3_BUCKET_RECIPE_CACHE}.s3.${AWS_REGION}.amazonaws.com/${s3Key}`;
          } else {
            imageUrl = photo.urls.regular;
          }
        }
      }
    } catch {
      // Non-fatal — continue without image
    }
  }

  // 6. Create Recipe row
  const recipe = await prisma.recipe.create({
    data: {
      id: recipeId,
      title: parsed.title || name,
      image: imageUrl,
      imageSourceUrl,
      cuisine: Array.isArray(parsed.cuisine) ? parsed.cuisine : [],
      dietTags: Array.isArray(parsed.dietTags) ? parsed.dietTags : [],
      readyMinutes: typeof parsed.readyMinutes === "number" ? parsed.readyMinutes : null,
      servings: typeof parsed.servings === "number" ? parsed.servings : targetServings,
      summary: typeof parsed.summary === "string" ? parsed.summary : null,
      instructions: Array.isArray(parsed.instructions) ? { steps: parsed.instructions } : Prisma.JsonNull,
      rawData: parsed,
      ingredients: {
        create: (Array.isArray(parsed.ingredients) ? parsed.ingredients : []).map(
          (ing: { name: string; amount?: number; unit?: string }) => ({
            canonicalName: ing.name.toLowerCase(),
            rawName: ing.name,
            amount: ing.amount ?? null,
            unit: ing.unit ?? null,
          }),
        ),
      },
    },
    include: { ingredients: true },
  });

  return recipe;
}
