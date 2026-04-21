output "api_url" {
  value = aws_apigatewayv2_stage.default.invoke_url
}
output "cognito_user_pool_id" {
  value = aws_cognito_user_pool.main.id
}
output "cognito_app_client_id" {
  value = aws_cognito_user_pool_client.main.id
}
output "pantry_uploads_bucket" {
  value = aws_s3_bucket.pantry_uploads.bucket
}
output "recipe_cache_bucket" {
  value = aws_s3_bucket.recipe_cache.bucket
}
output "aws_region" {
  value = var.aws_region
}

# ── RDS outputs ──────────────────────────────

output "database_url" {
  description = "PostgreSQL connection string for the backend .env"
  value       = "postgresql://${var.db_username}:${var.db_password}@${aws_db_instance.main.endpoint}/${var.db_name}?schema=pantrypal_app"
  sensitive   = true
}

output "rds_endpoint" {
  description = "RDS hostname:port"
  value       = aws_db_instance.main.endpoint
}
