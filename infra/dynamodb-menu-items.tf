resource "aws_dynamodb_table" "menu_items" {
  name         = "coral-menu-items"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }

  tags = {
    Name        = "coral-menu-items"
    Environment = var.environment
  }
}
