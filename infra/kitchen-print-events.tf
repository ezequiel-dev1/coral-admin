# The pinned AWS provider predates AppSync Event API resources. CloudFormation
# supports AWS::AppSync::Api, while retaining the Event APIs in Terraform state.
locals {
  kitchen_event_config = {
    AuthProviders = [
      { AuthType = "AWS_IAM" },
      { AuthType = "AMAZON_COGNITO_USER_POOLS", CognitoConfig = { UserPoolId = aws_cognito_user_pool.main.id, AwsRegion = var.aws_region, AppIdClientRegex = aws_cognito_user_pool_client.native_pos.id } },
    ]
    ConnectionAuthModes       = [{ AuthType = "AMAZON_COGNITO_USER_POOLS" }]
    DefaultPublishAuthModes   = [{ AuthType = "AWS_IAM" }]
    DefaultSubscribeAuthModes = [{ AuthType = "AMAZON_COGNITO_USER_POOLS" }]
  }
}

resource "aws_cloudformation_stack" "kitchen_print" {
  name         = "coral-kitchen-print-production"
  capabilities = []
  template_body = jsonencode({
    AWSTemplateFormatVersion = "2010-09-09"
    Resources = { EventApi = { Type = "AWS::AppSync::Api", Properties = { Name = "coral-kitchen-print-production", EventConfig = local.kitchen_event_config, Tags = [{ Key = "Environment", Value = "production" }] } } }
    Outputs = {
      arn      = { Value = { "Fn::GetAtt" = ["EventApi", "ApiArn"] } }
      httpUrl = { Value = { "Fn::Join" = ["", ["https://", { "Fn::GetAtt" = ["EventApi", "Dns.Http"] }, "/event"]] } }
    }
  })
}

resource "aws_cloudformation_stack" "kitchen_print_uat" {
  name         = "coral-kitchen-print-uat"
  capabilities = []
  template_body = jsonencode({
    AWSTemplateFormatVersion = "2010-09-09"
    Resources = { EventApi = { Type = "AWS::AppSync::Api", Properties = { Name = "coral-kitchen-print-uat", EventConfig = local.kitchen_event_config, Tags = [{ Key = "Environment", Value = "uat" }] } } }
    Outputs = {
      arn      = { Value = { "Fn::GetAtt" = ["EventApi", "ApiArn"] } }
      httpUrl = { Value = { "Fn::Join" = ["", ["https://", { "Fn::GetAtt" = ["EventApi", "Dns.Http"] }, "/event"]] } }
    }
  })
}
