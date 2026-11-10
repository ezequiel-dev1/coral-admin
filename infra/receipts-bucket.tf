resource "aws_s3_bucket" "receipts" {
  bucket = "coral-admin-receipts"

  tags = {
    Name        = "coral-admin-receipts"
    Environment = var.environment
  }
}

resource "aws_s3_bucket_public_access_block" "receipts" {
  bucket = aws_s3_bucket.receipts.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Browser uploads use pre-signed PUT URLs, which require CORS on the bucket.
resource "aws_s3_bucket_cors_configuration" "receipts" {
  bucket = aws_s3_bucket.receipts.id

  cors_rule {
    allowed_origins = [
      "https://admin.coral.restaurant",
      "https://admin-uat.coral.restaurant",
      "http://localhost:3000",
      "https://localhost:3000",
      "https://192.168.86.25:3000",
      "https://192.168.1.4:3000",
    ]
    allowed_methods = ["GET", "PUT"]
    allowed_headers = ["*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}
