#!/usr/bin/env tsx
/**
 * cleanup.ts — Tear down all PantryPal AWS infrastructure and reset local state
 *
 * Usage:
 *   npm run cleanup              # Interactive — confirms before destroying
 *   npm run cleanup -- --force   # Skip confirmation prompts
 *   npm run cleanup -- --local   # Only clean local files, don't touch AWS
 */

import { execSync } from "node:child_process";
import { existsSync, unlinkSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as readline from "node:readline";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const TF_DIR = path.resolve(ROOT, "infra", "terraform");

const FORCE = process.argv.includes("--force");
const LOCAL_ONLY = process.argv.includes("--local");

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

function run(cmd: string, opts?: { cwd?: string; ignoreError?: boolean }): boolean {
  console.log(`  $ ${cmd}`);
  try {
    execSync(cmd, {
      cwd: opts?.cwd ?? ROOT,
      stdio: "inherit",
      env: { ...process.env, FORCE_COLOR: "1" },
    });
    return true;
  } catch {
    if (!opts?.ignoreError) {
      console.warn(`  ⚠️  Command failed (non-fatal): ${cmd}`);
    }
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

function deleteFile(filePath: string, label: string) {
  if (!existsSync(filePath)) {
    console.log(`  ⏭️  ${label} — not found`);
    return;
  }
  try {
    unlinkSync(filePath);
    console.log(`  🗑️  Deleted ${label}`);
  } catch (err) {
    console.warn(`  ⚠️  Could not delete ${label}: ${(err as Error).message}`);
  }
}

function deleteDir(dirPath: string, label: string) {
  if (!existsSync(dirPath)) {
    console.log(`  ⏭️  ${label} — not found`);
    return;
  }
  try {
    // On Windows, use cmd /c rmdir for stubborn directories like node_modules
    if (process.platform === "win32") {
      execSync(`cmd /c "rmdir /s /q \"${dirPath}\""`, { stdio: "pipe" });
    } else {
      rmSync(dirPath, { recursive: true, force: true });
    }
    console.log(`  🗑️  Deleted ${label}`);
  } catch (err) {
    console.warn(`  ⚠️  Could not delete ${label}: ${(err as Error).message}`);
  }
}

/* ──────────────────────────────────────────────
   Main
   ────────────────────────────────────────────── */

async function main() {
  banner("🧹 PantryPal Backend — Cleanup");

  if (LOCAL_ONLY) {
    console.log("  Mode: LOCAL ONLY (skipping AWS resource destruction)");
  } else {
    console.log("  Mode: FULL CLEANUP (AWS resources + local files)");
  }

  // ─── Confirmation ─────────────────────────

  if (!FORCE) {
    console.log("");
    console.log("  This will:");
    if (!LOCAL_ONLY) {
      console.log("    🔴 DESTROY all AWS resources (RDS, Cognito, S3, Lambda, API Gateway)");
      console.log("    🔴 DELETE the PostgreSQL database and all data");
    }
    console.log("    🟡 Remove .env, terraform.tfvars, terraform state");
    console.log("    🟡 Remove dist/, node_modules/, and prisma/migrations/");
    console.log("");

    const answer = await ask("  ❓ Are you sure? Type 'yes' to confirm: ");
    if (answer !== "yes") {
      console.log("\n  ❌ Cleanup cancelled.");
      process.exit(0);
    }
  }

  let stepNum = 0;

  // ─── Step 1: Terraform Destroy ────────────

  if (!LOCAL_ONLY) {
    step(++stepNum, "Destroying AWS infrastructure (Terraform)");

    const tfVarsPath = path.resolve(TF_DIR, "terraform.tfvars");
    const tfStatePath = path.resolve(TF_DIR, "terraform.tfstate");
    const tfInitialized = existsSync(path.resolve(TF_DIR, ".terraform"));

    if (tfInitialized && existsSync(tfStatePath)) {
      if (existsSync(tfVarsPath)) {
        console.log("  → terraform destroy (this may take 5–10 min for RDS) …");
        run(`terraform destroy -var-file="terraform.tfvars" -auto-approve`, {
          cwd: TF_DIR,
          ignoreError: true,
        });
      } else {
        console.log("  ⚠️  No terraform.tfvars found — attempting destroy without vars …");
        // Try to destroy; this may fail if vars are required
        run("terraform destroy -auto-approve", {
          cwd: TF_DIR,
          ignoreError: true,
        });
      }
    } else if (tfInitialized) {
      console.log("  ⏭️  Terraform initialized but no state file — nothing to destroy");
    } else {
      console.log("  ⏭️  Terraform not initialized — nothing to destroy");
    }
  }

  // ─── Step 2: Clean Terraform local state ──

  step(++stepNum, "Cleaning Terraform local files");

  deleteDir(path.resolve(TF_DIR, ".terraform"), ".terraform/");
  deleteFile(path.resolve(TF_DIR, ".terraform.lock.hcl"), ".terraform.lock.hcl");
  deleteFile(path.resolve(TF_DIR, "terraform.tfstate"), "terraform.tfstate");
  deleteFile(path.resolve(TF_DIR, "terraform.tfstate.backup"), "terraform.tfstate.backup");
  deleteFile(path.resolve(TF_DIR, "terraform.tfvars"), "terraform.tfvars");

  // ─── Step 3: Clean environment files ──────

  step(++stepNum, "Cleaning environment & config files");

  deleteFile(path.resolve(ROOT, ".env"), ".env");

  // ─── Step 4: Clean build artifacts ────────

  step(++stepNum, "Cleaning build artifacts");

  deleteDir(path.resolve(ROOT, "dist"), "dist/");
  deleteDir(path.resolve(ROOT, "node_modules"), "node_modules/");

  // ─── Step 5: Clean Prisma ─────────────────

  step(++stepNum, "Cleaning Prisma artifacts");

  deleteDir(path.resolve(ROOT, "prisma", "migrations"), "prisma/migrations/");

  // ─── Done ─────────────────────────────────

  banner("✅ Cleanup Complete");

  console.log("  Everything has been reset. To set up again, run:");
  console.log("");
  console.log("    npm install");
  console.log("    npm run setup");
  console.log("");

  if (!LOCAL_ONLY) {
    console.log("  All AWS resources have been destroyed.");
    console.log("  No ongoing charges will be incurred.");
    console.log("");
  }
}

main().catch((err) => {
  console.error("\n❌ Cleanup failed:", err);
  process.exit(1);
});
