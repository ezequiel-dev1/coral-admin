resource "aws_dynamodb_table" "employees" {
  name         = "coral-employees"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }

  tags = {
    Name        = "coral-employees"
    Environment = "UAT"
  }
}

resource "aws_dynamodb_table" "payroll_receipts" {
  name         = "coral-payroll-receipts"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }

  tags = {
    Name        = "coral-payroll-receipts"
    Environment = "UAT"
  }
}
