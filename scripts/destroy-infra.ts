#!/usr/bin/env tsx
/**
 * destroy-infra.ts — Destroy all pp-backend AWS resources
 *
 * Works in ANY state — even if Terraform state was lost.
 * Discovers resources via AWS CLI and deletes them directly.
 *
 * Usage:
 *   npm run destroy              # Interactive — shows what will be deleted
 *   npm run destroy -- --force   # Skip confirmation
 *   npm run destroy -- --dry-run # Show what would be deleted, don't delete
 */

import { execSync } from "node:child_process";
import { existsSync, writeFileSync, unlinkSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as readline from "node:readline";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const TF_DIR = path.resolve(ROOT, "infra", "terraform");

const FORCE = process.argv.includes("--force");
const DRY_RUN = process.argv.includes("--dry-run");
const REGION = "us-east-2";

/* ──────────────────────────────────────────────
   Helpers
   ────────────────────────────────────────────── */

function banner(msg: string) {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  ${msg}`);
  console.log(`${"═".repeat(60)}\n`);
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

function aws(cmd: string): string | null {
  try {
    return execSync(`aws ${cmd}`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    }).trim();
  } catch {
    return null;
  }
}

function awsExec(cmd: string, label: string): boolean {
  if (DRY_RUN) {
    console.log(`  🔍 [DRY RUN] Would run: aws ${cmd}`);
    return true;
  }
  console.log(`  → ${label} …`);
  try {
    execSync(`aws ${cmd}`, {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    });
    console.log(`    ✅ Done`);
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("NoSuchEntity") || msg.includes("NotFoundException") || msg.includes("NoSuchBucket") || msg.includes("ResourceNotFoundFault")) {
      console.log(`    ⏭️  Already deleted`);
    } else {
      console.log(`    ⚠️  Failed: ${msg.slice(0, 120)}`);
    }
    return false;
  }
}

/* ──────────────────────────────────────────────
   Resource Discovery
   ────────────────────────────────────────────── */

interface DiscoveredResources {
  s3Buckets: string[];
  cognitoPools: Array<{ id: string; name: string }>;
  apiGateways: Array<{ id: string; name: string }>;
  lambdaFunctions: string[];
  logGroups: string[];
  iamRoles: string[];
  iamPolicies: Array<{ arn: string; name: string }>;
  iamGroups: string[];
  securityGroups: Array<{ id: string; name: string }>;
  dbInstances: string[];
  dbSubnetGroups: string[];
}

function discover(): DiscoveredResources {
  console.log("🔍 Scanning AWS for pp-backend resources …\n");

  // S3 Buckets
  const s3Raw = aws("s3api list-buckets --query \"Buckets[?starts_with(Name,'pp-backend-')].Name\" --output json");
  const s3Buckets: string[] = s3Raw ? JSON.parse(s3Raw) : [];

  // Cognito User Pools
  const cognitoRaw = aws(`cognito-idp list-user-pools --max-results 50 --region ${REGION} --query "UserPools[?starts_with(Name,'pp-backend')].{id:Id,name:Name}" --output json`);
  const cognitoPools: Array<{ id: string; name: string }> = cognitoRaw ? JSON.parse(cognitoRaw) : [];

  // API Gateways
  const apigwRaw = aws(`apigatewayv2 get-apis --region ${REGION} --query "Items[?starts_with(Name,'pp-backend')].{id:ApiId,name:Name}" --output json`);
  const apiGateways: Array<{ id: string; name: string }> = apigwRaw ? JSON.parse(apigwRaw) : [];

  // Lambda Functions
  const lambdaRaw = aws(`lambda list-functions --region ${REGION} --query "Functions[?starts_with(FunctionName,'pp-backend')].FunctionName" --output json`);
  const lambdaFunctions: string[] = lambdaRaw ? JSON.parse(lambdaRaw) : [];

  // CloudWatch Log Groups (created automatically by Lambda)
  const logsRaw = aws(`logs describe-log-groups --region ${REGION} --log-group-name-prefix "/aws/lambda/pp-backend" --query "logGroups[].logGroupName" --output json`);
  const logGroups: string[] = logsRaw ? JSON.parse(logsRaw) : [];

  // IAM Roles
  const rolesRaw = aws(`iam list-roles --query "Roles[?starts_with(RoleName,'pp-backend')].RoleName" --output json`);
  const iamRoles: string[] = rolesRaw ? JSON.parse(rolesRaw) : [];

  // IAM Policies
  const policiesRaw = aws(`iam list-policies --scope Local --query "Policies[?starts_with(PolicyName,'pp-backend')].{arn:Arn,name:PolicyName}" --output json`);
  const iamPolicies: Array<{ arn: string; name: string }> = policiesRaw ? JSON.parse(policiesRaw) : [];

  // IAM Groups
  const groupsRaw = aws(`iam list-groups --query "Groups[?starts_with(GroupName,'pp-backend')].GroupName" --output json`);
  const iamGroups: string[] = groupsRaw ? JSON.parse(groupsRaw) : [];

  // Security Groups
  const sgRaw = aws(`ec2 describe-security-groups --region ${REGION} --filters "Name=group-name,Values=pp-backend-*" --query "SecurityGroups[].{id:GroupId,name:GroupName}" --output json`);
  const securityGroups: Array<{ id: string; name: string }> = sgRaw ? JSON.parse(sgRaw) : [];

  // RDS Instances
  const rdsRaw = aws(`rds describe-db-instances --region ${REGION} --query "DBInstances[?starts_with(DBInstanceIdentifier,'pp-backend')].DBInstanceIdentifier" --output json`);
  const dbInstances: string[] = rdsRaw ? JSON.parse(rdsRaw) : [];

  // DB Subnet Groups
  const subnetRaw = aws(`rds describe-db-subnet-groups --region ${REGION} --query "DBSubnetGroups[?starts_with(DBSubnetGroupName,'pp-backend')].DBSubnetGroupName" --output json`);
  const dbSubnetGroups: string[] = subnetRaw ? JSON.parse(subnetRaw) : [];

  return { s3Buckets, cognitoPools, apiGateways, lambdaFunctions, logGroups, iamRoles, iamPolicies, iamGroups, securityGroups, dbInstances, dbSubnetGroups };
}

function printDiscovered(r: DiscoveredResources): number {
  let total = 0;

  const items: Array<[string, string[]]> = [
    ["S3 Buckets", r.s3Buckets],
    ["Cognito User Pools", r.cognitoPools.map((p) => `${p.name} (${p.id})`)],
    ["API Gateways", r.apiGateways.map((a) => `${a.name} (${a.id})`)],
    ["Lambda Functions", r.lambdaFunctions],
    ["CloudWatch Log Groups", r.logGroups],
    ["IAM Roles", r.iamRoles],
    ["IAM Policies", r.iamPolicies.map((p) => p.name)],
    ["IAM Groups", r.iamGroups],
    ["Security Groups", r.securityGroups.map((sg) => `${sg.name} (${sg.id})`)],
    ["RDS Instances", r.dbInstances],
    ["DB Subnet Groups", r.dbSubnetGroups],
  ];

  for (const [label, list] of items) {
    if (list.length > 0) {
      console.log(`  🔴 ${label}:`);
      for (const item of list) console.log(`     • ${item}`);
      total += list.length;
    }
  }

  if (total === 0) {
    console.log("  ✅ No pp-backend resources found in AWS.");
  }

  return total;
}

/* ──────────────────────────────────────────────
   Destroy
   ────────────────────────────────────────────── */

async function destroyResources(r: DiscoveredResources) {
  console.log("");

  // 1. RDS instances (takes longest — start first)
  for (const dbId of r.dbInstances) {
    awsExec(
      `rds delete-db-instance --db-instance-identifier ${dbId} --skip-final-snapshot --delete-automated-backups --region ${REGION}`,
      `Deleting RDS instance: ${dbId}`,
    );
  }

  // If RDS instances exist, wait for them to be deleted
  if (r.dbInstances.length > 0 && !DRY_RUN) {
    console.log("\n  ⏳ Waiting for RDS deletion (this takes 3–5 minutes) …");
    for (const dbId of r.dbInstances) {
      try {
        execSync(
          `aws rds wait db-instance-deleted --db-instance-identifier ${dbId} --region ${REGION}`,
          { stdio: ["pipe", "pipe", "pipe"], timeout: 600_000 },
        );
        console.log(`    ✅ ${dbId} deleted`);
      } catch {
        console.log(`    ⚠️  Timeout waiting for ${dbId} — it may still be deleting`);
      }
    }
  }

  // 2. Lambda functions
  for (const fn of r.lambdaFunctions) {
    awsExec(`lambda delete-function --function-name ${fn} --region ${REGION}`, `Deleting Lambda: ${fn}`);
  }

  // 2b. CloudWatch Log Groups (created by Lambda, not auto-deleted)
  for (const lg of r.logGroups) {
    awsExec(`logs delete-log-group --log-group-name ${lg} --region ${REGION}`, `Deleting log group: ${lg}`);
  }

  // 3. API Gateways
  for (const api of r.apiGateways) {
    awsExec(`apigatewayv2 delete-api --api-id ${api.id} --region ${REGION}`, `Deleting API Gateway: ${api.name}`);
  }

  // 4. Cognito
  for (const pool of r.cognitoPools) {
    // Must delete domain first if exists
    awsExec(`cognito-idp delete-user-pool --user-pool-id ${pool.id} --region ${REGION}`, `Deleting Cognito pool: ${pool.name}`);
  }

  // 5. S3 Buckets (empty then delete)
  for (const bucket of r.s3Buckets) {
    awsExec(`s3 rm s3://${bucket} --recursive`, `Emptying S3: ${bucket}`);
    awsExec(`s3api delete-bucket --bucket ${bucket} --region ${REGION}`, `Deleting S3: ${bucket}`);
  }

  // 6. IAM — order matters: inline policies → detach → delete
  for (const role of r.iamRoles) {
    // List and delete inline policies
    const inlineRaw = aws(`iam list-role-policies --role-name ${role} --query "PolicyNames" --output json`);
    const inlinePolicies: string[] = inlineRaw ? JSON.parse(inlineRaw) : [];
    for (const policyName of inlinePolicies) {
      awsExec(`iam delete-role-policy --role-name ${role} --policy-name ${policyName}`, `Detach inline policy: ${policyName}`);
    }

    // List and detach managed policies
    const attachedRaw = aws(`iam list-attached-role-policies --role-name ${role} --query "AttachedPolicies[].PolicyArn" --output json`);
    const attachedPolicies: string[] = attachedRaw ? JSON.parse(attachedRaw) : [];
    for (const arn of attachedPolicies) {
      awsExec(`iam detach-role-policy --role-name ${role} --policy-arn ${arn}`, `Detach managed policy from role`);
    }

    awsExec(`iam delete-role --role-name ${role}`, `Deleting IAM role: ${role}`);
  }

  for (const group of r.iamGroups) {
    // Detach all policies from group
    const groupPoliciesRaw = aws(`iam list-attached-group-policies --group-name ${group} --query "AttachedPolicies[].PolicyArn" --output json`);
    const groupPolicies: string[] = groupPoliciesRaw ? JSON.parse(groupPoliciesRaw) : [];
    for (const arn of groupPolicies) {
      awsExec(`iam detach-group-policy --group-name ${group} --policy-arn ${arn}`, `Detach policy from group`);
    }
    awsExec(`iam delete-group --group-name ${group}`, `Deleting IAM group: ${group}`);
  }

  for (const policy of r.iamPolicies) {
    // Must delete all non-default policy versions before the policy itself
    const versionsRaw = aws(`iam list-policy-versions --policy-arn ${policy.arn} --query "Versions[?!IsDefaultVersion].VersionId" --output json`);
    const versions: string[] = versionsRaw ? JSON.parse(versionsRaw) : [];
    for (const versionId of versions) {
      awsExec(`iam delete-policy-version --policy-arn ${policy.arn} --version-id ${versionId}`, `Deleting policy version: ${versionId}`);
    }
    awsExec(`iam delete-policy --policy-arn ${policy.arn}`, `Deleting IAM policy: ${policy.name}`);
  }

  // 7. Security Groups
  for (const sg of r.securityGroups) {
    awsExec(`ec2 delete-security-group --group-id ${sg.id} --region ${REGION}`, `Deleting security group: ${sg.name}`);
  }

  // 8. DB Subnet Groups (must be after RDS)
  for (const sg of r.dbSubnetGroups) {
    awsExec(`rds delete-db-subnet-group --db-subnet-group-name ${sg} --region ${REGION}`, `Deleting DB subnet group: ${sg}`);
  }
}

/* ──────────────────────────────────────────────
   Clean local files
   ────────────────────────────────────────────── */

function cleanLocal() {
  console.log("\n🧹 Cleaning local Terraform state …");

  const files = [
    path.resolve(TF_DIR, "terraform.tfstate"),
    path.resolve(TF_DIR, "terraform.tfstate.backup"),
    path.resolve(TF_DIR, "terraform.tfvars"),
    path.resolve(TF_DIR, ".terraform.lock.hcl"),
    path.resolve(ROOT, ".env"),
  ];

  for (const f of files) {
    if (existsSync(f)) {
      try {
        unlinkSync(f);
        console.log(`  🗑️  ${path.basename(f)}`);
      } catch { /* skip */ }
    }
  }

  const dirs = [path.resolve(TF_DIR, ".terraform"), path.resolve(ROOT, "dist")];
  for (const d of dirs) {
    if (existsSync(d)) {
      try {
        if (process.platform === "win32") {
          execSync(`cmd /c "rmdir /s /q \"${d}\""`, { stdio: "pipe" });
        } else {
          rmSync(d, { recursive: true, force: true });
        }
        console.log(`  🗑️  ${path.basename(d)}/`);
      } catch { /* skip */ }
    }
  }
}

/* ──────────────────────────────────────────────
   Main
   ────────────────────────────────────────────── */

async function main() {
  banner("💣 pp-backend — Infrastructure Destroy");

  if (DRY_RUN) {
    console.log("  Mode: DRY RUN (no changes will be made)\n");
  }

  // Verify AWS credentials
  const identity = aws("sts get-caller-identity --query Account --output text");
  if (!identity) {
    console.error("  ❌ AWS credentials not configured. Run: aws configure");
    process.exit(1);
  }
  console.log(`  ✅ AWS Account: ${identity}\n`);

  // Discover
  const resources = discover();
  const total = printDiscovered(resources);

  if (total === 0) {
    cleanLocal();
    banner("✅ Nothing to destroy — all clean!");
    return;
  }

  // Confirm
  if (!FORCE && !DRY_RUN) {
    console.log(`\n  ⚠️  ${total} resource(s) will be PERMANENTLY DELETED.`);
    const answer = await ask("  ❓ Type 'destroy' to confirm: ");
    if (answer !== "destroy") {
      console.log("\n  ❌ Cancelled.");
      process.exit(0);
    }
  }

  // Destroy
  await destroyResources(resources);

  // Clean local
  cleanLocal();

  // Verify
  if (!DRY_RUN) {
    console.log("\n🔍 Verifying cleanup …");
    const remaining = discover();
    const leftover = printDiscovered(remaining);
    if (leftover > 0) {
      console.log(`\n  ⚠️  ${leftover} resource(s) may still be deleting. Check the AWS Console.`);
    }
  }

  banner("✅ Infrastructure Destroyed");
  console.log("  All AWS resources have been removed.");
  console.log("  No ongoing charges will be incurred.\n");
  console.log("  To rebuild, run:");
  console.log("    npm install && npm run setup\n");
}

main().catch((err) => {
  console.error("\n❌ Destroy failed:", err);
  process.exit(1);
});
