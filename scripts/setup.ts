#!/usr/bin/env tsx
/**
 * setup.ts — One-command setup & deploy for PantryPal Backend
 *
 * Usage:
 *   npm run setup              # Interactive full setup
 *   npm run setup -- --skip-tf # Skip Terraform (local dev only)
 *
 * What it does:
 *   1. Checks prerequisites (node, npm, terraform, aws cli)
 *   2. Copies .env.example → .env (if missing) and prompts for required values
 *   3. Installs npm dependencies
 *   4. Generates Prisma Client
 *   5. Initialises and applies Terraform (creates RDS, Cognito, S3, API Gateway)
 *   6. Syncs Terraform outputs (including DATABASE_URL from RDS) back into .env
 *   7. Runs Prisma migrations + seed against the new RDS
 *   8. Bundles the Lambda function
 *   9. Re-applies Terraform to deploy the Lambda zip
 */

import { execSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as readline from "node:readline";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const ENV_PATH = path.resolve(ROOT, ".env");
const ENV_EXAMPLE = path.resolve(ROOT, ".env.example");
const TF_DIR = path.resolve(ROOT, "infra", "terraform");

const SKIP_TF = process.argv.includes("--skip-tf");

/* ──────────────────────────────────────────────
   Helpers
   ────────────────────────────────────────────── */

function banner(msg: string) {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  ${msg}`);
  console.log(`${"═".repeat(60)}\n`);
}

function step(n: number, msg: string) {
  console.log(`\n🔹 Step ${n}: ${msg}`);
  console.log("─".repeat(50));
}

function run(cmd: string, opts?: { cwd?: string; ignoreError?: boolean }) {
  console.log(`  $ ${cmd}`);
  try {
    execSync(cmd, {
      cwd: opts?.cwd ?? ROOT,
      stdio: "inherit",
      env: { ...process.env, FORCE_COLOR: "1" },
    });
  } catch (err) {
    if (!opts?.ignoreError) {
      console.error(`\n❌ Command failed: ${cmd}`);
      process.exit(1);
    }
  }
}

function commandExists(cmd: string): boolean {
  try {
    execSync(`where ${cmd}`, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/* ──────────────────────────────────────────────
   .env management
   ────────────────────────────────────────────── */

function parseEnv(filePath: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!existsSync(filePath)) return map;
  const content = readFileSync(filePath, "utf-8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    map.set(key, value);
  }
  return map;
}

function writeEnv(envMap: Map<string, string>, filePath: string) {
  // Read original file to preserve comments and ordering
  if (!existsSync(filePath)) {
    const lines = Array.from(envMap.entries()).map(([k, v]) => `${k}=${v}`);
    writeFileSync(filePath, lines.join("\n") + "\n", "utf-8");
    return;
  }

  const content = readFileSync(filePath, "utf-8");
  const lines = content.split(/\r?\n/);
  const written = new Set<string>();

  const output = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return line;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) return line;
    const key = trimmed.slice(0, eq).trim();
    if (envMap.has(key)) {
      written.add(key);
      return `${key}=${envMap.get(key)}`;
    }
    return line;
  });

  // Append any new keys not in the original file
  for (const [key, value] of envMap) {
    if (!written.has(key)) {
      output.push(`${key}=${value}`);
    }
  }

  writeFileSync(filePath, output.join("\n"), "utf-8");
}

/* ──────────────────────────────────────────────
   Required env vars and their prompts
   ────────────────────────────────────────────── */

const REQUIRED_VARS: Array<{
  key: string;
  prompt: string;
  isSecret: boolean;
  defaultValue?: string;
  skipIfTfManaged?: boolean;
}> = [
  {
    key: "DB_PASSWORD",
    prompt: "RDS database password (min 8 chars, will be used for the Terraform-provisioned PostgreSQL)",
    isSecret: true,
  },
  {
    key: "SPOONACULAR_API_KEY",
    prompt: "Spoonacular API key (get from https://spoonacular.com/food-api/console)",
    isSecret: true,
  },
  {
    key: "FRONTEND_ORIGIN",
    prompt: "Frontend origin URL",
    isSecret: false,
    defaultValue: "http://localhost:5173",
  },
  {
    key: "AWS_REGION",
    prompt: "AWS region",
    isSecret: false,
    defaultValue: "us-east-2",
    skipIfTfManaged: true,
  },
  {
    key: "UNSPLASH_ACCESS_KEY",
    prompt: "Unsplash API key (optional — press Enter to skip)",
    isSecret: true,
  },
];

/* ──────────────────────────────────────────────
   Main
   ────────────────────────────────────────────── */

async function main() {
  banner("🍳 PantryPal Backend — Setup & Deploy");

  // ─── Step 1: Prerequisites ────────────────

  step(1, "Checking prerequisites");

  const checks = [
    { cmd: "node", label: "Node.js" },
    { cmd: "npm", label: "npm" },
    ...(!SKIP_TF ? [{ cmd: "terraform", label: "Terraform" }] : []),
    ...(!SKIP_TF ? [{ cmd: "aws", label: "AWS CLI" }] : []),
  ];

  let allFound = true;
  for (const { cmd, label } of checks) {
    const found = commandExists(cmd);
    console.log(`  ${found ? "✅" : "❌"} ${label} (${cmd})`);
    if (!found) allFound = false;
  }

  if (!allFound) {
    console.error("\n❌ Missing prerequisites. Install them and re-run.");
    process.exit(1);
  }

  // Node version check
  const nodeVersion = process.version;
  const major = parseInt(nodeVersion.slice(1));
  if (major < 20) {
    console.error(`\n❌ Node.js ${nodeVersion} detected. Requires Node.js 20+.`);
    process.exit(1);
  }
  console.log(`  ✅ Node.js ${nodeVersion}`);

  // ─── Step 2: Environment Variables ────────

  step(2, "Setting up environment variables");

  if (!existsSync(ENV_PATH)) {
    if (existsSync(ENV_EXAMPLE)) {
      copyFileSync(ENV_EXAMPLE, ENV_PATH);
      console.log("  📄 Created .env from .env.example");
    } else {
      writeFileSync(ENV_PATH, "", "utf-8");
      console.log("  📄 Created empty .env");
    }
  } else {
    console.log("  📄 .env already exists");
  }

  const envMap = parseEnv(ENV_PATH);

  for (const varDef of REQUIRED_VARS) {
    const current = envMap.get(varDef.key);
    const isPlaceholder = !current || current.startsWith("<") || current === "";

    if (!isPlaceholder) {
      const display = varDef.isSecret ? "****" : current;
      console.log(`  ✅ ${varDef.key} = ${display}`);
      continue;
    }

    if (varDef.skipIfTfManaged && !SKIP_TF) {
      if (varDef.defaultValue) {
        envMap.set(varDef.key, varDef.defaultValue);
        console.log(`  ⏭️  ${varDef.key} = ${varDef.defaultValue} (will be set from Terraform)`);
      }
      continue;
    }

    const defaultHint = varDef.defaultValue ? ` [${varDef.defaultValue}]` : "";
    const answer = await ask(`  ❓ ${varDef.prompt}${defaultHint}: `);
    const value = answer || varDef.defaultValue || "";

    if (value) {
      envMap.set(varDef.key, value);
    } else {
      console.log(`  ⏭️  Skipping ${varDef.key}`);
    }
  }

  // Set defaults for non-prompted vars
  if (!envMap.has("PORT")) envMap.set("PORT", "8788");
  if (!envMap.has("BEDROCK_MODEL_ID")) envMap.set("BEDROCK_MODEL_ID", "amazon.nova-lite-v1:0");
  if (!envMap.has("COGNITO_REGION")) envMap.set("COGNITO_REGION", envMap.get("AWS_REGION") ?? "us-east-2");

  writeEnv(envMap, ENV_PATH);
  console.log("\n  💾 .env saved");

  // ─── Step 3: Install dependencies ─────────

  step(3, "Installing npm dependencies");
  run("npm install");

  // ─── Step 4: Prisma Client + Lambda Bundle ──

  step(4, "Generating Prisma Client & bundling Lambda");
  run("npx prisma generate");

  console.log("  → Bundling Lambda (Terraform needs the zip) …");
  run("npx tsx scripts/bundle-lambda.ts");

  // ─── Step 5: Terraform ────────────────────

  let tfApplied = false;

  if (!SKIP_TF) {
    step(5, "Provisioning AWS infrastructure (Terraform)");
    console.log("  ℹ️  This will create: RDS PostgreSQL, Cognito, S3 buckets, API Gateway, Lambda");

    // Check for terraform.tfvars
    const tfVarsPath = path.resolve(TF_DIR, "terraform.tfvars");
    if (!existsSync(tfVarsPath)) {
      console.log("  📄 Creating terraform.tfvars …");
      const tfVars = [
        `frontend_origin     = "${envMap.get("FRONTEND_ORIGIN") ?? "http://localhost:5173"}"`,
        `db_password          = "${envMap.get("DB_PASSWORD") ?? ""}"`,
        `db_username          = "pp_backend_admin"`,
        `db_name              = "pp_backend"`,
        `spoonacular_api_key  = "${envMap.get("SPOONACULAR_API_KEY") ?? ""}"`,
        `unsplash_access_key  = "${envMap.get("UNSPLASH_ACCESS_KEY") ?? ""}"`,
        `aws_region           = "${envMap.get("AWS_REGION") ?? "us-east-2"}"`,
      ].join("\n");
      writeFileSync(tfVarsPath, tfVars + "\n", "utf-8");
    }

    console.log("  → terraform init …");
    run("terraform init", { cwd: TF_DIR });

    console.log("  → terraform plan …");
    run(`terraform plan -var-file="terraform.tfvars"`, { cwd: TF_DIR });

    const proceed = await ask("\n  ❓ Apply Terraform changes? (y/N): ");
    if (proceed.toLowerCase() === "y" || proceed.toLowerCase() === "yes") {
      console.log("  → terraform apply (this may take 5–10 min for RDS) …");
      run(`terraform apply -var-file="terraform.tfvars" -auto-approve`, { cwd: TF_DIR });
      tfApplied = true;

      // Sync TF outputs → .env (this sets DATABASE_URL from RDS)
      console.log("\n  → Syncing Terraform outputs to .env …");
      run("npx tsx scripts/sync-env-from-terraform.ts");
    } else {
      console.log("  ⏭️  Skipping Terraform apply");
    }

    // ─── Step 6: Prisma Migrations (now that RDS exists) ──

    if (tfApplied) {
      step(6, "Running database migrations & seed");

      // Re-read .env to pick up DATABASE_URL from Terraform sync
      const updatedEnv = parseEnv(ENV_PATH);
      const dbUrl = updatedEnv.get("DATABASE_URL");

      if (dbUrl && !dbUrl.startsWith("<")) {
        // Set DATABASE_URL in process.env for child processes
        process.env.DATABASE_URL = dbUrl;

        console.log("  → Running database migrations …");
        run("npx prisma migrate dev --name init", { ignoreError: true });

        console.log("  → Seeding database …");
        run("npx tsx prisma/seed.ts", { ignoreError: true });
      } else {
        console.log("  ⚠️  DATABASE_URL not available — skipping migrations");
      }
    }

    // ─── Step 7: Bundle & Deploy Lambda ───────

    step(7, "Building & deploying Lambda function");

    console.log("  → Bundling Lambda …");
    run("npx tsx scripts/bundle-lambda.ts");

    if (tfApplied) {
      console.log("  → Re-applying Terraform to deploy updated Lambda …");
      run(`terraform apply -var-file="terraform.tfvars" -auto-approve`, { cwd: TF_DIR });

      // Get the API URL
      try {
        const apiUrl = execSync("terraform output -raw api_url", {
          cwd: TF_DIR,
          encoding: "utf-8",
        }).trim();
        console.log(`\n  🌐 API deployed at: ${apiUrl}`);
      } catch {
        // Non-fatal
      }
    }
  } else {
    step(5, "Skipping Terraform (--skip-tf flag)");
    console.log("  ⚠️  DATABASE_URL must be set manually in .env for local dev");
    console.log("  To deploy later, run: npm run deploy");
  }

  // ─── Done ─────────────────────────────────

  banner("✅ Setup Complete!");

  console.log("  Quick reference:");
  console.log("  ─────────────────────────────────────────");
  console.log("  npm run dev          Start local dev server (port 8788)");
  console.log("  npm run build        TypeScript compile check");
  console.log("  npm run bundle       Bundle Lambda zip");
  console.log("  npm run deploy       Full Terraform deploy");
  console.log("  npm run env:from-tf  Sync Terraform outputs → .env");
  console.log("  npm run prisma:migrate  Run database migrations");
  console.log("  npm run prisma:seed     Seed questions & ingredients");
  console.log("");

  if (SKIP_TF) {
    console.log("  ⚡ Start the dev server now:");
    console.log("     npm run dev");
    console.log("");
  }
}

main().catch((err) => {
  console.error("\n❌ Setup failed:", err);
  process.exit(1);
});
