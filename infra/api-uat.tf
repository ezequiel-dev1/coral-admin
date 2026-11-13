# UAT API: Stripe (TEST mode) checkout / cancel / webhook / feedback, plus the
# Uber Eats webhook and UAT-only Uber test helper.
#
#   CloudFront (admin-uat.coral.restaurant, path /api/*)
#     -> API Gateway HTTP API (Cognito JWT on the staff-only routes)
#       -> Lambda "coral-admin-api-uat" (bundled by `npm run build:api:uat`)
#
# Mirrors api.tf but is fully isolated from production: its own Lambda, IAM role
# and API, the coral-* (UAT) tables, and test-mode secrets created by hand:
#
#   stripe-secret-key-uat       sk_test_... (or rk_test_...)
#   stripe-webhook-secret-uat   whsec_...   (test-mode webhook endpoint secret)
#
# The Uber sandbox credentials secret is shared with api.tf.
#
# Run `npm run build:api:uat` BEFORE `terraform plan/apply` so infra/api-dist-uat exists.

# Metadata only; Terraform never reads the secret value.
data "aws_secretsmanager_secret" "stripe_secret_key_uat" {
  name = "stripe-secret-key-uat"
}

locals {
  stripe_webhook_secret_name_uat = "stripe-webhook-secret-uat"

  # route key => requires a signed-in Cognito user?
  api_routes_uat = merge(local.api_routes, {
    # UAT-only Uber helper. The handler also checks for an Administrator/Overlord group.
    "POST /api/uber-eats/test" = true
    # Publishes the UAT menu to the Uber sandbox store (admin group checked in the handler).
    "POST /api/uber-eats/menu" = true
    "GET /api/uber-eats/stores" = true
  })
}

data "archive_file" "api_uat" {
  type        = "zip"
  source_dir  = "${path.module}/api-dist-uat"
  output_path = "${path.module}/api-dist-uat.zip"
}

# --- IAM (least privilege: UAT orders + feedback tables, three secrets) ---

resource "aws_iam_role" "api_uat" {
  name = "coral-admin-api-uat-lambda"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "api_uat_logs" {
  role       = aws_iam_role.api_uat.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "api_uat" {
  name = "coral-admin-api-uat"
  role = aws_iam_role.api_uat.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ReadSecrets"
        Effect = "Allow"
        Action = ["secretsmanager:GetSecretValue"]
        Resource = [
          data.aws_secretsmanager_secret.stripe_secret_key_uat.arn,
          "arn:aws:secretsmanager:${var.aws_region}:${data.aws_caller_identity.current.account_id}:secret:${local.stripe_webhook_secret_name_uat}-*",
          data.aws_secretsmanager_secret.uber_eats_credentials.arn,
        ]
      },
      {
        Sid      = "OrdersTable"
        Effect   = "Allow"
        Action   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem"]
        Resource = aws_dynamodb_table.orders.arn
      },
      {
        Sid      = "InviteUsers"
        Effect   = "Allow"
        Action   = ["cognito-idp:AdminCreateUser", "cognito-idp:AdminAddUserToGroup"]
        Resource = aws_cognito_user_pool.main.arn
      },
      {
        Sid      = "FeedbackTable"
        Effect   = "Allow"
        Action   = ["dynamodb:PutItem", "dynamodb:Scan"]
        Resource = aws_dynamodb_table.feedback.arn
      },
      {
        Sid      = "MenuItemsTable"
        Effect   = "Allow"
        Action   = ["dynamodb:Scan", "dynamodb:UpdateItem"]
        Resource = aws_dynamodb_table.menu_items.arn
      },
      {
        Sid      = "MenuIngredientsTable"
        Effect   = "Allow"
        Action   = ["dynamodb:Scan"]
        Resource = aws_dynamodb_table.menu_ingredients.arn
      },
      {
        # Menu photos only: Uber downloads them through short-lived pre-signed URLs.
        Sid      = "MenuPhotos"
        Effect   = "Allow"
        Action   = ["s3:GetObject"]
        Resource = "${aws_s3_bucket.receipts.arn}/menu-items/*"
      },
    ]
  })
}

# --- Lambda ---

resource "aws_cloudwatch_log_group" "api_uat" {
  name              = "/aws/lambda/coral-admin-api-uat"
  retention_in_days = 30
}

resource "aws_lambda_function" "api_uat" {
  function_name    = "coral-admin-api-uat"
  role             = aws_iam_role.api_uat.arn
  runtime          = "nodejs22.x"
  handler          = "index.handler"
  filename         = data.archive_file.api_uat.output_path
  source_code_hash = data.archive_file.api_uat.output_base64sha256
  timeout          = 15
  memory_size      = 256

  environment {
    variables = {
      NEXT_PUBLIC_APP_ENV             = "uat"
      STRIPE_SECRET_ID                = data.aws_secretsmanager_secret.stripe_secret_key_uat.name
      STRIPE_WEBHOOK_SECRET_ID        = local.stripe_webhook_secret_name_uat
      UBER_EATS_CREDENTIALS_SECRET_ID = data.aws_secretsmanager_secret.uber_eats_credentials.name
      SITE_URL                        = "https://${var.uat_domain_name}"
      COGNITO_USER_POOL_ID            = aws_cognito_user_pool.main.id
    }
  }

  depends_on = [aws_cloudwatch_log_group.api_uat, aws_iam_role_policy_attachment.api_uat_logs]
}

# --- API Gateway (HTTP API) ---

resource "aws_apigatewayv2_api" "api_uat" {
  name          = "coral-admin-api-uat"
  protocol_type = "HTTP"
}

resource "aws_apigatewayv2_integration" "api_uat" {
  api_id                 = aws_apigatewayv2_api.api_uat.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.api_uat.invoke_arn
  payload_format_version = "2.0"
}

# Same Cognito user pool as production (UAT and prod share staff accounts).
resource "aws_apigatewayv2_authorizer" "cognito_uat" {
  api_id           = aws_apigatewayv2_api.api_uat.id
  name             = "cognito"
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]

  jwt_configuration {
    audience = [aws_cognito_user_pool_client.app.id]
    issuer   = "https://cognito-idp.${var.aws_region}.amazonaws.com/${aws_cognito_user_pool.main.id}"
  }
}

resource "aws_apigatewayv2_route" "api_uat" {
  for_each = local.api_routes_uat

  api_id             = aws_apigatewayv2_api.api_uat.id
  route_key          = each.key
  target             = "integrations/${aws_apigatewayv2_integration.api_uat.id}"
  authorization_type = each.value ? "JWT" : "NONE"
  authorizer_id      = each.value ? aws_apigatewayv2_authorizer.cognito_uat.id : null
}

resource "aws_apigatewayv2_stage" "api_uat" {
  api_id      = aws_apigatewayv2_api.api_uat.id
  name        = "$default"
  auto_deploy = true

  default_route_settings {
    throttling_burst_limit = 50
    throttling_rate_limit  = 25
  }
}

resource "aws_lambda_permission" "api_uat" {
  statement_id  = "AllowApiGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api_uat.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.api_uat.execution_arn}/*/*"
}
