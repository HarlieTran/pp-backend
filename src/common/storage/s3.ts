import { S3Client } from "@aws-sdk/client-s3";

const AWS_REGION = process.env.AWS_REGION ?? "us-east-2";

export const s3 = new S3Client({ region: AWS_REGION });
