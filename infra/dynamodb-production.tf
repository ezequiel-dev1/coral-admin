# Production DynamoDB tables (coral-prod-*). The UAT tables are the original
# coral-* ones defined in the sibling dynamodb*.tf files. The app picks which
# set to use with NEXT_PUBLIC_APP_ENV (see app/lib/tables.ts).
#
# Key schemas mirror the UAT tables exactly.

locals {
  production_tables = {
    "shared-loans"     = { hash_key = "id", range_key = null }
    "investments"      = { hash_key = "id", range_key = null }
    "ledger"           = { hash_key = "id", range_key = null }
    "menu-items"       = { hash_key = "id", range_key = null }
    "menu-ingredients" = { hash_key = "id", range_key = null }
    "orders"           = { hash_key = "id", range_key = null }
    "feedback"         = { hash_key = "id", range_key = null }
    "loan-charges"     = { hash_key = "loanId", range_key = "chargeId" }
  }
}

resource "aws_dynamodb_table" "production" {
  for_each = local.production_tables

  name         = "coral-prod-${each.key}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = each.value.hash_key
  range_key    = each.value.range_key

  dynamic "attribute" {
    for_each = compact([each.value.hash_key, each.value.range_key])
    content {
      name = attribute.value
      type = "S"
    }
  }

  tags = {
    Name        = "coral-prod-${each.key}"
    Environment = "production"
  }
}

# These tables were created with the AWS CLI first. The import blocks let
# `terraform apply` adopt them instead of failing on create.
import {
  for_each = local.production_tables
  to       = aws_dynamodb_table.production[each.key]
  id       = "coral-prod-${each.key}"
}
