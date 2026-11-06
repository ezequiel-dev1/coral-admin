resource "aws_dynamodb_table" "feedback" {
  name         = "coral-feedback"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }

  tags = {
    Name        = "coral-feedback"
    Environment = "UAT"
  }
}

