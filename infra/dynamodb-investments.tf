resource "aws_dynamodb_table" "investments" {
  name         = "coral-investments"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }

  tags = {
    Name        = "coral-investments"
    Environment = var.environment
  }
}
