# --- Cognito Identity Pool (for authenticated AWS access from browser) ---

resource "aws_cognito_identity_pool" "main" {
  identity_pool_name               = "coral-admin-identity-pool"
  allow_unauthenticated_identities = false

  cognito_identity_providers {
    client_id               = aws_cognito_user_pool_client.app.id
    provider_name           = "cognito-idp.${var.aws_region}.amazonaws.com/${aws_cognito_user_pool.main.id}"
    server_side_token_check = false
  }

  tags = {
    Name        = "coral-admin-identity-pool"
    Environment = var.environment
  }
}

# --- IAM Role for authenticated users ---

resource "aws_iam_role" "authenticated" {
  name = "coral-admin-cognito-authenticated"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = "cognito-identity.amazonaws.com"
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "cognito-identity.amazonaws.com:aud" = aws_cognito_identity_pool.main.id
          }
          "ForAnyValue:StringLike" = {
            "cognito-identity.amazonaws.com:amr" = "authenticated"
          }
        }
      }
    ]
  })

  tags = {
    Name        = "coral-admin-authenticated-role"
    Environment = var.environment
  }
}

# --- Policy: allow DynamoDB access to coral tables ---

resource "aws_iam_role_policy" "dynamodb_access" {
  name = "coral-dynamodb-access"
  role = aws_iam_role.authenticated.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DynamoDBAccess"
        Effect    = "Allow"
        Action    = [
          "dynamodb:Scan",
          "dynamodb:Query",
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem"
        ]
        Resource = [
          aws_dynamodb_table.shared_loans.arn,
          aws_dynamodb_table.loan_charges.arn,
          aws_dynamodb_table.investments.arn,
          aws_dynamodb_table.ledger.arn
        ]
      },
      {
        Sid       = "ReceiptsS3Access"
        Effect    = "Allow"
        Action    = [
          "s3:GetObject",
          "s3:PutObject"
        ]
        Resource = [
          "${aws_s3_bucket.receipts.arn}/*"
        ]
      }
    ]
  })
}

# --- Attach role to identity pool ---

resource "aws_cognito_identity_pool_roles_attachment" "main" {
  identity_pool_id = aws_cognito_identity_pool.main.id

  roles = {
    authenticated = aws_iam_role.authenticated.arn
  }
}

output "identity_pool_id" {
  value = aws_cognito_identity_pool.main.id
}
