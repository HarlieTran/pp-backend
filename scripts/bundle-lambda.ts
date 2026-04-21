/**
 * bundle-lambda.ts
 *
 * Bundles the Express app into a single file for AWS Lambda deployment
 * using esbuild, then zips it into dist/lambda.zip.
 *
 * Run via: npm run bundle
 */

import { execSync } from "node:child_process";
import { mkdirSync, existsSync, unlinkSync, createWriteStream, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import AdmZip from "adm-zip";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");
const DIST_DIR = path.resolve(PROJECT_ROOT, "dist");

async function main() {
  console.log("📦 Bundling Lambda function …");

  // 1. Clean & create dist/
  mkdirSync(DIST_DIR, { recursive: true });
  const zipPath = path.resolve(DIST_DIR, "lambda.zip");
  if (existsSync(zipPath)) unlinkSync(zipPath);

  // 2. Generate Prisma Client (must exist before bundling)
  console.log("  → Generating Prisma Client …");
  execSync("npx prisma generate", { cwd: PROJECT_ROOT, stdio: "inherit" });

  // 3. esbuild → dist/lambda.js
  console.log("  → esbuild bundling …");
  await build({
    entryPoints: [path.resolve(PROJECT_ROOT, "src/lambda.ts")],
    bundle: true,
    platform: "node",
    target: "node20",
    format: "esm",
    outfile: path.resolve(DIST_DIR, "lambda.mjs"),
    minify: true,
    sourcemap: true,
    external: [
      // Keep native/binary deps external (Lambda layer or node_modules)
      "@prisma/client",
      "@prisma/engines",
      "prisma",
    ],
    banner: {
      // ESM compatibility shim for __dirname / require
      js: `
        import { createRequire } from 'module';
        import { fileURLToPath } from 'url';
        import { dirname } from 'path';
        const require = createRequire(import.meta.url);
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = dirname(__filename);
      `.trim(),
    },
  });

  console.log("  → Creating lambda.zip …");

  const prismaSchemaPath = path.resolve(PROJECT_ROOT, "prisma", "schema.prisma");

  const zip = new AdmZip();
  zip.addLocalFile(path.resolve(DIST_DIR, "lambda.mjs"));
  if (existsSync(path.resolve(DIST_DIR, "lambda.mjs.map"))) {
    zip.addLocalFile(path.resolve(DIST_DIR, "lambda.mjs.map"));
  }
  zip.addLocalFile(prismaSchemaPath);

  // Add the generated Prisma client and engine
  if (existsSync(path.resolve(PROJECT_ROOT, "node_modules", ".prisma"))) {
    zip.addLocalFolder(path.resolve(PROJECT_ROOT, "node_modules", ".prisma"), "node_modules/.prisma");
  }
  if (existsSync(path.resolve(PROJECT_ROOT, "node_modules", "@prisma", "client"))) {
    zip.addLocalFolder(path.resolve(PROJECT_ROOT, "node_modules", "@prisma", "client"), "node_modules/@prisma/client");
  }

  zip.writeZip(zipPath);

  // Report size
  const stats = readFileSync(zipPath);
  const sizeMB = (stats.length / 1024 / 1024).toFixed(2);
  console.log(`\n✅ Lambda bundle ready: dist/lambda.zip (${sizeMB} MB)`);
  console.log("   Upload via: terraform apply  (uses filename = \"dist/lambda.zip\")");
}

main().catch((err) => {
  console.error("❌ Bundle failed:", err);
  process.exit(1);
});
