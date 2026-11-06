resource "aws_dynamodb_table" "reservations" {
  name         = "coral-reservations"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }

  tags = {
    Name        = "coral-reservations"
    Environment = "UAT"
  }
}
