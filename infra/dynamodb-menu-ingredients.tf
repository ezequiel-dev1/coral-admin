resource "aws_dynamodb_table" "menu_ingredients" {
  name         = "coral-menu-ingredients"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }

  tags = {
    Name        = "coral-menu-ingredients"
    Environment = "UAT"
  }
}
