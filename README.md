# PantryPal Backend (`pp-backend`)

This repository contains the completely serverless backend for PantryPal, built entirely on AWS using Terraform and Node.js.

## Prerequisites

Before cloning and running the infrastructure, ensure you have the following installed on your local machine:
- **Node.js** (v20+)
- **Terraform** (v1.5+)
- **AWS CLI** (configured with your AWS credentials)
- An AWS Account with sufficient permissions to create IAM roles, API Gateways, RDS databases, Lambdas, and S3 buckets.

## Getting Started

1. **Clone the repository:**
   ```bash
   git clone <repo_url>
   cd pp-backend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment variables:**
   Copy the example environment file and fill in your custom values:
   ```bash
   cp .env.example .env
   ```
   > **Note:** The `setup` script will automatically populate many of these variables (like `DATABASE_URL` and `API_URL`) after Terraform provisions the resources.

## Running the Infrastructure

This project uses a "single-click" setup script that initializes Terraform, provisions all the required AWS infrastructure, and runs Prisma database migrations.

1. **Provision AWS Resources:**
   ```bash
   npm run setup
   ```
   This process will take a few minutes as it provisions an RDS PostgreSQL database, API Gateway, S3 buckets, Cognito User Pools, and the Lambda function.

2. **Deploy Code Updates:**
   If you ever modify the code in `src/`, you must bundle and deploy it to the Lambda function by running:
   ```bash
   npm run deploy
   ```
   > **Windows Users:** If you get a PowerShell policy error, run `cmd /c npm run deploy`.

For a detailed breakdown of the deployment process, please read the [deployment.md](./deployment.md) guide.

## Testing the API

Once your infrastructure is successfully deployed, the `setup` and `deploy` scripts will output your live `API_URL` (e.g., `https://<api-id>.execute-api.<region>.amazonaws.com/`).

You can verify that the API and database are running correctly by checking the health route.

**Test Case (cURL):**
```bash
curl <YOUR_API_URL>/health
```

## Destroying the Infrastructure

To avoid incurring unwanted AWS charges, you can easily destroy the entire infrastructure (including the database, lambdas, and API gateways) with a single command.

> [!WARNING]
> This is a destructive action! It will permanently delete the RDS database, all user data, and the S3 buckets.

**To destroy all resources:**
```bash
npm run destroy
```
You will be prompted by Terraform to type `yes` to confirm the destruction of the resources.
