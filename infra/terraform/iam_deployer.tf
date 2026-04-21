# ──────────────────────────────────────────────
# IAM Deployer Policy — MANAGED MANUALLY
#
# The deployer policy is a bootstrap resource that must exist
# BEFORE Terraform can run, so it cannot be managed by Terraform.
#
# To create/update: Go to IAM → Policies in the AWS Console
# and use the JSON from: infra/iam-deployer-policy.json
# ──────────────────────────────────────────────
