# Backend Deployment Guide

Unlike the frontend, which automatically builds and deploys via AWS Amplify whenever you push to the `master` branch on GitHub, the `pp-backend` requires manual deployment. 

This repository uses **Terraform** to provision infrastructure (API Gateway, RDS, Lambda, S3, Cognito) and an **esbuild** bundling script to package the TypeScript code for AWS Lambda.

## Quick Deploy

Whenever you make changes to the backend source code (e.g., adding a new route, updating a service), you **must** run the following command to bundle and deploy your changes to AWS:

```bash
npm run deploy
```

> **Note for Windows Users:**
> If you encounter PowerShell execution policy errors, run the command via CMD:
> `cmd /c npm run deploy`

### What `npm run deploy` Does:
1. **Bundles:** Runs `scripts/bundle-lambda.ts` which uses `esbuild` to compile your TypeScript code into a single, optimized `dist/main.js` file.
2. **Packages:** Zips the output into a `.zip` file ready for AWS Lambda.
3. **Applies:** Navigates to `infra/terraform` and runs `terraform apply -auto-approve` to upload the code and apply any infrastructure changes.

---

## Infrastructure Operations

The backend includes several helper scripts for managing your infrastructure lifecycle:

### Setup / Initialization
If you are setting up the project on a new machine or need to re-initialize the infrastructure:
```bash
npm run setup
```
This script initializes Terraform, provisions all AWS resources, runs Prisma migrations to set up your database schema, and writes the output values to your local `.env` file.

### Environment Synchronization
If you need to pull the latest environment variables (like Database URLs, Cognito Client IDs, API endpoints) from the deployed AWS infrastructure into your local `.env` file:
```bash
npm run env:from-tf
```

### Database Migrations
If you make changes to `prisma/schema.prisma`:
1. Generate the client: `npm run prisma:generate`
2. Apply the migration: `npm run prisma:migrate`
3. Push to GitHub AND run `npm run deploy` so the Lambda gets the updated Prisma client.

### Teardown
If you ever need to completely destroy the AWS infrastructure (warning: this deletes the database and all data!):
```bash
npm run destroy
```
To perform a "dry run" and see what would be destroyed without actually deleting anything:
```bash
npm run destroy:check
```
To bypass the safety confirmation prompt and force deletion:
```bash
npm run destroy:force
```

### Cleanup Operations
To remove the generated `dist/` folder and clean up Terraform caches:
```bash
npm run cleanup
```
*(Use `npm run cleanup:local` to only clean the `dist/` folder without touching Terraform).*

## Summary Checklist for Updates
1. Write/edit code in `src/`.
2. Commit and push to GitHub (this saves your work but does NOT deploy it).
3. Run `npm run deploy` locally to push the new Lambda code to AWS.
