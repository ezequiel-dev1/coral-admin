resource "aws_dynamodb_table" "shared_loans" {
  name         = "coral-shared-loans"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }

  tags = {
    Name        = "coral-shared-loans"
    Environment = var.environment
  }
}
