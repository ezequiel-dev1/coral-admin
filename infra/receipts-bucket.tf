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
