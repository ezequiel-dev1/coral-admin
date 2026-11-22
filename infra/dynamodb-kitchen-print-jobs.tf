# Idempotency is the table key: location + destination + client UUID.  Job IDs
# remain random and are never derived from order content.
resource "aws_dynamodb_table" "kitchen_print_jobs" {
  name         = "coral-kitchen-print-jobs"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "idempotencyKey"

  attribute {
    name = "idempotencyKey"
    type = "S"
  }

  tags = { Name = "coral-kitchen-print-jobs", Environment = "UAT" }
}

resource "aws_dynamodb_table" "kitchen_printer_status" {
  name         = "coral-kitchen-printer-status"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "locationId"

  attribute {
    name = "locationId"
    type = "S"
  }

  tags = { Name = "coral-kitchen-printer-status", Environment = "UAT" }
}
