# --- Cognito User Pool ---

resource "aws_cognito_user_pool" "main" {
  name = "coral-admin-users"

  # Sign-in with email
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  password_policy {
    minimum_length    = 8
    require_lowercase = true
    require_numbers   = true
    require_symbols   = false
    require_uppercase = true
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  # Email configuration (Cognito default sender)
  email_configuration {
    email_sending_account = "COGNITO_DEFAULT"
  }

  schema {
    name                = "email"
    attribute_data_type = "String"
    required            = true
    mutable             = true

    string_attribute_constraints {
      min_length = 1
      max_length = 256
    }
  }

  schema {
    name                = "name"
    attribute_data_type = "String"
    required            = true
    mutable             = true

    string_attribute_constraints {
      min_length = 1
      max_length = 256
    }
  }

  tags = {
    Name        = "coral-admin"
    Environment = var.environment
  }
}

# --- Cognito User Pool Domain (hosted UI) ---

resource "aws_cognito_user_pool_domain" "main" {
  domain       = "coral-admin-auth"
  user_pool_id = aws_cognito_user_pool.main.id
}

# --- Cognito User Pool Client ---

resource "aws_cognito_user_pool_client" "app" {
  name         = "coral-admin-web"
  user_pool_id = aws_cognito_user_pool.main.id

  # OAuth settings
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_scopes                 = ["email", "openid", "profile"]
  supported_identity_providers         = ["COGNITO"]

  # Callback URLs
  callback_urls = [
    "https://${var.domain_name}/",
    "http://localhost:3000/", # for local dev
  ]

  logout_urls = [
    "https://${var.domain_name}/",
    "http://localhost:3000/",
  ]

  # Token validity
  access_token_validity  = 1  # hours
  id_token_validity      = 1  # hours
  refresh_token_validity = 30 # days

  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "days"
  }

  # No client secret for SPA (public client)
  generate_secret = false

  # Prevent user existence errors from leaking
  prevent_user_existence_errors = "ENABLED"

  explicit_auth_flows = [
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_SRP_AUTH",
  ]
}
