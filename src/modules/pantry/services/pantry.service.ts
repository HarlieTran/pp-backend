import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { prisma } from "../../../common/db/prisma.js";
import { s3 } from "../../../common/storage/s3.js";
import { stripCodeFence } from "../../../common/ai/bedrock.js";
import { matchIngredient } from "../../ingredients/index.js";
import {
  computeExpiryStatus,
  sortByExpiryUrgency,
  type ParsedIngredient,
} from "../model/pantry.types.js";

const PANTRY_IMAGES_BUCKET = process.env.PANTRY_IMAGES_BUCKET ?? "pp-backend-pantry-images";
const AWS_REGION = process.env.AWS_REGION ?? "us-east-2";
const BEDROCK_MODEL_ID = process.env.BEDROCK_MODEL_ID ?? "amazon.nova-lite-v1:0";

const bedrockClient = new BedrockRuntimeClient({ region: AWS_REGION });

/* ──────────────────────────────────────────────
   getPantryItems — sorted by expiry urgency
   ────────────────────────────────────────────── */

export async function getPantryItems(userProfileId: string) {
  const items = await prisma.pantryItem.findMany({
    where: { userProfileId },
  });

  const enriched = items.map((item) => ({
    ...item,
    ...computeExpiryStatus(item.expiryDate),
  }));

  return sortByExpiryUrgency(enriched);
}

/* ──────────────────────────────────────────────
   addPantryItem — single item with ingredient matching
   ────────────────────────────────────────────── */

export async function addPantryItem(
  userProfileId: string,
  data: { rawName: string; quantity: number; unit: string; expiryDate?: string; notes?: string },
) {
  const matched = await matchIngredient(data.rawName);

  const item = await prisma.pantryItem.create({
    data: {
      userProfileId,
      rawName: data.rawName,
      canonicalName: matched.canonicalName,
      ingredientId: matched.ingredientId,
      category: matched.category,
      quantity: data.quantity,
      unit: data.unit,
      expiryDate: data.expiryDate ?? null,
      notes: data.notes ?? null,
    },
  });

  return { ...item, ...computeExpiryStatus(item.expiryDate) };
}

/* ──────────────────────────────────────────────
   updatePantryItem
   ────────────────────────────────────────────── */

export async function updatePantryItem(
  userProfileId: string,
  itemId: string,
  data: { quantity?: number; unit?: string; expiryDate?: string | null; notes?: string | null },
) {
  // Verify ownership
  const existing = await prisma.pantryItem.findUnique({ where: { id: itemId } });
  if (!existing || existing.userProfileId !== userProfileId) {
    throw new Error("Not found");
  }

  const item = await prisma.pantryItem.update({
    where: { id: itemId },
    data: {
      quantity: data.quantity,
      unit: data.unit,
      expiryDate: data.expiryDate,
      notes: data.notes,
    },
  });

  return { ...item, ...computeExpiryStatus(item.expiryDate) };
}

/* ──────────────────────────────────────────────
   deletePantryItem — verifies ownership
   ────────────────────────────────────────────── */

export async function deletePantryItem(userProfileId: string, itemId: string) {
  const existing = await prisma.pantryItem.findUnique({ where: { id: itemId } });
  if (!existing || existing.userProfileId !== userProfileId) {
    throw new Error("Not found");
  }

  await prisma.pantryItem.delete({ where: { id: itemId } });
  return { ok: true };
}

/* ──────────────────────────────────────────────
   getPresignedUploadUrl — S3 PutObject presigned URL
   ────────────────────────────────────────────── */

export async function getPresignedUploadUrl(userProfileId: string, filename: string, contentType: string) {
  const imageKey = `pantry-uploads/${userProfileId}/${Date.now()}-${filename}`;

  const command = new PutObjectCommand({
    Bucket: PANTRY_IMAGES_BUCKET,
    Key: imageKey,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 });

  return { uploadUrl, imageKey };
}

/* ──────────────────────────────────────────────
   parseImageForIngredients — Bedrock Nova Lite
   ────────────────────────────────────────────── */

export async function parseImageForIngredients(
  userProfileId: string,
  imageKey: string,
): Promise<ParsedIngredient[]> {
  // Validate the key belongs to this user
  if (!imageKey.startsWith(`pantry-uploads/${userProfileId}/`)) {
    throw new Error("Forbidden: image key does not belong to user");
  }

  // Fetch image bytes from S3
  const getCmd = new GetObjectCommand({
    Bucket: PANTRY_IMAGES_BUCKET,
    Key: imageKey,
  });
  const s3Res = await s3.send(getCmd);
  const imageBytes = await s3Res.Body?.transformToByteArray();
  if (!imageBytes) throw new Error("Failed to read image from S3");

  const mimeType = s3Res.ContentType ?? "image/jpeg";
  const imageFormat = mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : "jpeg";

  const prompt = [
    "# Grocery List Extraction Expert",
    "## Task",
    "Analyze this image (receipt, grocery photo, pantry shelf, or spice rack) and extract a clean, normalized grocery list in JSON format.",
    "## Output Requirements",
    '- Return ONLY valid JSON: {"items":[{"name":"string","quantity":"string","unit":"string","category":"string"}]}',
    "- category must be one of: produce, dairy, meat, seafood, grains, spices, condiments, frozen, beverages, snacks, other",
    "## Rules",
    "1) Include only food/grocery items.",
    "2) Clean and canonicalize item names to shopper-friendly form.",
    "3) Extract accurate quantities and units.",
    "4) Merge duplicate items.",
    "Process the image carefully and return only the structured JSON output.",
  ].join("\n");

  const command = new ConverseCommand({
    modelId: BEDROCK_MODEL_ID,
    messages: [
      {
        role: "user",
        content: [
          { text: prompt },
          {
            image: {
              format: imageFormat,
              source: { bytes: imageBytes },
            },
          },
        ],
      },
    ],
    inferenceConfig: {
      maxTokens: 1200,
      temperature: 0.1,
    },
  });

  const bedrockRes = await bedrockClient.send(command);
  const text = bedrockRes.output?.message?.content?.find((block) => "text" in block)?.text ?? "";

  if (!text) throw new Error("Bedrock returned empty response");

  const cleaned = stripCodeFence(text);
  const parsed = JSON.parse(cleaned);
  const items = Array.isArray(parsed.items) ? parsed.items : [];

  return items.filter(
    (item: ParsedIngredient) => typeof item.name === "string" && item.name.trim().length > 0,
  );
}

/* ──────────────────────────────────────────────
   bulkAddPantryItems — max 50 items at once
   ────────────────────────────────────────────── */

export async function bulkAddPantryItems(
  userProfileId: string,
  items: Array<{ rawName: string; quantity: number; unit: string; expiryDate?: string; notes?: string }>,
) {
  const results = [];

  for (const item of items) {
    const matched = await matchIngredient(item.rawName);
    const created = await prisma.pantryItem.create({
      data: {
        userProfileId,
        rawName: item.rawName,
        canonicalName: matched.canonicalName,
        ingredientId: matched.ingredientId,
        category: matched.category,
        quantity: item.quantity,
        unit: item.unit,
        expiryDate: item.expiryDate ?? null,
        notes: item.notes ?? null,
      },
    });
    results.push({ ...created, ...computeExpiryStatus(created.expiryDate) });
  }

  return results;
}
