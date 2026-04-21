terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
  }

  # Local backend — state stored in infra/terraform/terraform.tfstate
  # To migrate to S3 later, uncomment the block below and run `terraform init -migrate-state`
  #
  # backend "s3" {
  #   bucket = "pp-backend-tfstate"
  #   key    = "v3/api/terraform.tfstate"
  #   region = "us-east-2"
  # }
}

provider "aws" {
  region = var.aws_region
}
