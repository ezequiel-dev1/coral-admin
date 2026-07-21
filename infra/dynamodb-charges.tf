resource "aws_dynamodb_table" "loan_charges" {
  name         = "coral-loan-charges"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "loanId"
  range_key    = "chargeId"

  attribute {
    name = "loanId"
    type = "S"
  }

  attribute {
    name = "chargeId"
    type = "S"
  }

  tags = {
    Name        = "coral-loan-charges"
    Environment = var.environment
  }
}
