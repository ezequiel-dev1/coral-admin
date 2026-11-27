resource "aws_dynamodb_table" "audit_events" {
  name         = "coral-audit-events"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "entityId"
  range_key    = "eventId"

  attribute {
    name = "entityId"
    type = "S"
  }

  attribute {
    name = "eventId"
    type = "S"
  }

  tags = { Name = "coral-audit-events", Environment = "UAT" }
}
