resource "aws_dynamodb_table" "orders" {
  name         = "coral-orders"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }

  tags = {
    Name        = "coral-orders"
    Environment = "UAT"
  }
}
