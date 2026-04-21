/**
 * sync-env-from-terraform.ts
 *
 * Reads Terraform outputs from `infra/terraform` and writes/merges them
 * into the backend `.env` file. Run via: `npm run env:from-tf`
 *
 * Mapping (Terraform output → .env variable):
 *   api_url              → API_URL
 *   cognito_user_pool_id → COGNITO_USER_POOL_ID
 *   cognito_app_client_id→ COGNITO_APP_CLIENT_ID
 *   pantry_uploads_bucket→ PANTRY_IMAGES_BUCKET
 *   recipe_cache_bucket  → S3_BUCKET_RECIPE_CACHE
 *   aws_region           → AWS_REGION, COGNITO_REGION
 *   database_url         → DATABASE_URL  (from RDS)
 *   rds_endpoint         → RDS_ENDPOINT
 *
 * Protected values (SPOONACULAR_API_KEY, UNSPLASH_ACCESS_KEY)
 * are preserved from the existing .env and never overwritten.
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");
const ENV_PATH = path.resolve(PROJECT_ROOT, ".env");
const TF_DIR = path.resolve(PROJECT_ROOT, "infra", "terraform");

/* ──────────────────────────────────────────────
   1. Run `terraform output -json` to get current values
   ────────────────────────────────────────────── */

interface TerraformOutput {
  [key: string]: { value: string; type: string; sensitive: boolean };
}

function getTerraformOutputs(): TerraformOutput {
  try {
    const raw = execSync("terraform output -json", {
      cwd: TF_DIR,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return JSON.parse(raw);
  } catch (err) {
    console.error("❌ Failed to run `terraform output -json`.");
    console.error("   Make sure Terraform is initialized in", TF_DIR);
    console.error("   Run: cd infra/terraform && terraform init && terraform apply");
    if (err instanceof Error) console.error("  ", err.message);
    process.exit(1);
  }
}

/* ──────────────────────────────────────────────
   2. Parse existing .env into a Map (preserves ordering + comments)
   ────────────────────────────────────────────── */

interface EnvLine {
  type: "comment" | "blank" | "var";
  raw: string;
  key?: string;
  value?: string;
}

function parseEnvFile(filePath: string): EnvLine[] {
  if (!existsSync(filePath)) return [];

  const content = readFileSync(filePath, "utf-8");
  return content.split(/\r?\n/).map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return { type: "blank", raw: line };
    if (trimmed.startsWith("#")) return { type: "comment", raw: line };

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex <= 0) return { type: "comment", raw: line };

    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    return { type: "var", raw: line, key, value };
  });
}

function serializeEnvLines(lines: EnvLine[]): string {
  return lines.map((l) => {
    if (l.type === "var") return `${l.key}=${l.value}`;
    return l.raw;
  }).join("\n");
}

/* ──────────────────────────────────────────────
   3. Mapping: Terraform output keys → .env variable names
   ────────────────────────────────────────────── */

const TF_TO_ENV: Record<string, string[]> = {
  cognito_user_pool_id: ["COGNITO_USER_POOL_ID"],
  cognito_app_client_id: ["COGNITO_APP_CLIENT_ID"],
  pantry_uploads_bucket: ["PANTRY_IMAGES_BUCKET"],
  recipe_cache_bucket: ["S3_BUCKET_RECIPE_CACHE"],
  aws_region: ["AWS_REGION", "COGNITO_REGION"],
  api_url: ["API_URL"],
  database_url: ["DATABASE_URL"],
  rds_endpoint: ["RDS_ENDPOINT"],
};

/** Keys that should NEVER be overwritten from Terraform (user must set manually) */
const PROTECTED_KEYS = new Set([
  "SPOONACULAR_API_KEY",
  "UNSPLASH_ACCESS_KEY",
  "PORT",
  "FRONTEND_ORIGIN",
]);

/* ──────────────────────────────────────────────
   4. Main — merge TF outputs into .env
   ────────────────────────────────────────────── */

function main() {
  console.log("📡 Fetching Terraform outputs from:", TF_DIR);
  const outputs = getTerraformOutputs();

  // Build the key→value map from TF outputs
  const tfValues: Record<string, string> = {};
  for (const [tfKey, envKeys] of Object.entries(TF_TO_ENV)) {
    const output = outputs[tfKey];
    if (!output) {
      console.warn(`⚠️  Terraform output "${tfKey}" not found — skipping`);
      continue;
    }
    for (const envKey of envKeys) {
      tfValues[envKey] = String(output.value);
    }
  }

  if (Object.keys(tfValues).length === 0) {
    console.log("⚠️  No Terraform outputs matched. Nothing to write.");
    return;
  }

  // Parse existing .env (or start from .env.example)
  let envLines: EnvLine[];
  if (existsSync(ENV_PATH)) {
    envLines = parseEnvFile(ENV_PATH);
    console.log(`📄 Loaded existing .env (${envLines.length} lines)`);
  } else {
    const examplePath = path.resolve(PROJECT_ROOT, ".env.example");
    if (existsSync(examplePath)) {
      envLines = parseEnvFile(examplePath);
      console.log(`📄 Created .env from .env.example (${envLines.length} lines)`);
    } else {
      envLines = [];
      console.log("📄 Creating new .env");
    }
  }

  // Merge TF values into env lines
  const existingKeys = new Set(envLines.filter((l) => l.type === "var").map((l) => l.key));
  let updatedCount = 0;
  let addedCount = 0;

  for (const [envKey, tfValue] of Object.entries(tfValues)) {
    if (PROTECTED_KEYS.has(envKey)) continue;

    if (existingKeys.has(envKey)) {
      // Update existing line
      const line = envLines.find((l) => l.type === "var" && l.key === envKey);
      if (line && line.value !== tfValue) {
        console.log(`  ✏️  ${envKey}: ${line.value} → ${tfValue}`);
        line.value = tfValue;
        updatedCount++;
      }
    } else {
      // Append new variable
      console.log(`  ➕ ${envKey}=${tfValue}`);
      envLines.push({ type: "var", raw: `${envKey}=${tfValue}`, key: envKey, value: tfValue });
      addedCount++;
    }
  }

  // Write back
  writeFileSync(ENV_PATH, serializeEnvLines(envLines), "utf-8");

  console.log("");
  console.log(`✅ .env synced — ${updatedCount} updated, ${addedCount} added`);
  console.log(`   Protected (not overwritten): ${[...PROTECTED_KEYS].join(", ")}`);
  console.log(`   File: ${ENV_PATH}`);
}

main();
