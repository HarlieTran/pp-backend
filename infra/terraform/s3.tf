resource "aws_s3_bucket" "pantry_uploads" {
  bucket = "pp-backend-pantry-images"
}

resource "aws_s3_bucket_cors_configuration" "pantry_uploads" {
  bucket = aws_s3_bucket.pantry_uploads.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["PUT", "POST"]
    allowed_origins = ["*"]
    expose_headers  = []
    max_age_seconds = 3000
  }
}

resource "aws_s3_bucket" "recipe_cache" {
  bucket = "pp-backend-recipe-cache"
}

resource "aws_s3_bucket_public_access_block" "pantry_uploads" {
  bucket                  = aws_s3_bucket.pantry_uploads.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_public_access_block" "recipe_cache" {
  bucket                  = aws_s3_bucket.recipe_cache.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
