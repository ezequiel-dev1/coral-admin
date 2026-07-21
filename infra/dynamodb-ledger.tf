resource "aws_dynamodb_table" "ledger" {
  name         = "coral-ledger"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }

  tags = {
    Name        = "coral-ledger"
    Environment = var.environment
  }
}
