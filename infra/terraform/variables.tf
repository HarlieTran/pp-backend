variable "aws_region" {
  default = "us-east-2"
}
variable "frontend_origin" {
  type = string
}

# ── RDS credentials ──────────────────────────
variable "db_name" {
  type    = string
  default = "pp_backend"
}
variable "db_username" {
  type    = string
  default = "pp_backend_admin"
}
variable "db_password" {
  type      = string
  sensitive = true
}

# ── API keys ─────────────────────────────────
variable "spoonacular_api_key" {
  type      = string
  sensitive = true
}
variable "unsplash_access_key" {
  type      = string
  default   = ""
  sensitive = true
}
variable "bedrock_model_id" {
  default = "amazon.nova-lite-v1:0"
}
