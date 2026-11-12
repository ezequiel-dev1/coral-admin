# Production API: Stripe checkout / cancel / webhook / feedback.
#
#   CloudFront (admin.coral.restaurant, path /api/*)
#     -> API Gateway HTTP API (Cognito JWT on the staff-only routes)
#       -> Lambda "coral-admin-api" (bundled from app/api/** by `npm run build:api`)
#
# The live Stripe key is NOT managed here. It lives in AWS Secrets Manager as
# "stripe-secret-key" (created by hand) and is read by the Lambda at cold start.
# The webhook signing secret goes in a second secret, "stripe-webhook-secret",
# created after the live webhook endpoint exists in the Stripe Dashboard.
#
# Run `npm run build:api` BEFORE `terraform plan/apply` so infra/api-dist exists.

data "aws_caller_identity" "current" {}

# Metadata only; Terraform never reads the secret value.
data "aws_secretsmanager_secret" "stripe_secret_key" {
  name = "stripe-secret-key"
}

# Created outside Terraform so no Uber credential ever enters state. JSON value:
# {"client_id":"…","client_secret":"…"}
data "aws_secretsmanager_secret" "uber_eats_credentials" {
  name = "uber-eats-client-credentials"
}

locals {
  stripe_webhook_secret_name = "stripe-webhook-secret"

  # route key => requires a signed-in Cognito user?
  # - webhook: public, protected by Stripe's signature check inside the handler
  # - POST feedback: public, customers rate their order from the Stripe return page
  api_routes = {
    "POST /api/webhook"           = false
    "POST /api/uber-eats/webhook" = false
    "POST /api/feedback"          = false
    "GET /api/feedback"           = true
    "GET /api/card-present"       = true
    "POST /api/checkout"          = true
    "POST /api/checkout/cancel"   = true
    "GET /api/self-checkout"      = false
    "POST /api/self-checkout"     = false
  }
}

# --- Lambda package ---

data "archive_file" "api" {
  type        = "zip"
  source_dir  = "${path.module}/api-dist"
  output_path = "${path.module}/api-dist.zip"
}

# --- IAM (least privilege: prod orders + feedback tables, two secrets) ---

resource "aws_iam_role" "api" {
  name = "coral-admin-api-lambda"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "api_logs" {
  role       = aws_iam_role.api.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "api" {
  name = "coral-admin-api"
  role = aws_iam_role.api.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ReadStripeSecrets"
        Effect = "Allow"
        Action = ["secretsmanager:GetSecretValue"]
        Resource = [
          data.aws_secretsmanager_secret.stripe_secret_key.arn,
          # Secrets Manager appends a random suffix to the ARN.
          "arn:aws:secretsmanager:${var.aws_region}:${data.aws_caller_identity.current.account_id}:secret:${local.stripe_webhook_secret_name}-*",
          data.aws_secretsmanager_secret.uber_eats_credentials.arn,
        ]
      },
      {
        Sid      = "OrdersTable"
        Effect   = "Allow"
        Action   = ["dynamodb:GetItem", "dynamodb:UpdateItem"]
        Resource = aws_dynamodb_table.production["orders"].arn
      },
      {
        Sid      = "UberUatOrdersTable"
        Effect   = "Allow"
        Action   = ["dynamodb:PutItem", "dynamodb:UpdateItem"]
        Resource = aws_dynamodb_table.orders.arn
      },
      {
        Sid      = "FeedbackTable"
        Effect   = "Allow"
        Action   = ["dynamodb:PutItem", "dynamodb:Scan"]
        Resource = aws_dynamodb_table.production["feedback"].arn
      },
    ]
  })
}

# --- Lambda ---

resource "aws_cloudwatch_log_group" "api" {
  name              = "/aws/lambda/coral-admin-api"
  retention_in_days = 90
}

resource "aws_lambda_function" "api" {
  function_name    = "coral-admin-api"
  role             = aws_iam_role.api.arn
  runtime          = "nodejs22.x"
  handler          = "index.handler"
  filename         = data.archive_file.api.output_path
  source_code_hash = data.archive_file.api.output_base64sha256
  timeout          = 15
  memory_size      = 256

  environment {
    variables = {
      NEXT_PUBLIC_APP_ENV             = "production"
      STRIPE_SECRET_ID                = data.aws_secretsmanager_secret.stripe_secret_key.name
      STRIPE_WEBHOOK_SECRET_ID        = local.stripe_webhook_secret_name
      UBER_EATS_CREDENTIALS_SECRET_ID = data.aws_secretsmanager_secret.uber_eats_credentials.name
      SITE_URL                        = "https://${var.domain_name}"
    }
  }

  depends_on = [aws_cloudwatch_log_group.api, aws_iam_role_policy_attachment.api_logs]
}

# --- API Gateway (HTTP API) ---

resource "aws_apigatewayv2_api" "api" {
  name          = "coral-admin-api"
  protocol_type = "HTTP"
}

resource "aws_apigatewayv2_integration" "api" {
  api_id                 = aws_apigatewayv2_api.api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.api.invoke_arn
  payload_format_version = "2.0"
}

# Staff-only routes require a valid Cognito ID token (aud = the web client id).
resource "aws_apigatewayv2_authorizer" "cognito" {
  api_id           = aws_apigatewayv2_api.api.id
  name             = "cognito"
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]

  jwt_configuration {
    audience = [aws_cognito_user_pool_client.app.id]
    issuer   = "https://cognito-idp.${var.aws_region}.amazonaws.com/${aws_cognito_user_pool.main.id}"
  }
}

resource "aws_apigatewayv2_route" "api" {
  for_each = local.api_routes

  api_id             = aws_apigatewayv2_api.api.id
  route_key          = each.key
  target             = "integrations/${aws_apigatewayv2_integration.api.id}"
  authorization_type = each.value ? "JWT" : "NONE"
  authorizer_id      = each.value ? aws_apigatewayv2_authorizer.cognito.id : null
}

resource "aws_apigatewayv2_stage" "api" {
  api_id      = aws_apigatewayv2_api.api.id
  name        = "$default"
  auto_deploy = true

  # Cap abuse of the public routes (webhook / customer feedback).
  default_route_settings {
    throttling_burst_limit = 50
    throttling_rate_limit  = 25
  }
}

resource "aws_lambda_permission" "api" {
  statement_id  = "AllowApiGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.api.execution_arn}/*/*"
}
