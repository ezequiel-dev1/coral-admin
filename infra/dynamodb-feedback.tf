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

# This table was created outside Terraform (AWS CLI) before this file existed.
# The import block lets `terraform apply` adopt it instead of failing on create.
import {
  to = aws_dynamodb_table.feedback
  id = "coral-feedback"
}
