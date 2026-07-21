output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID (needed for cache invalidation on deploy)"
  value       = aws_cloudfront_distribution.site.id
}

output "cloudfront_domain_name" {
  description = "CloudFront domain name"
  value       = aws_cloudfront_distribution.site.domain_name
}

output "s3_bucket_name" {
  description = "S3 bucket name for deploying site assets"
  value       = aws_s3_bucket.site.id
}

output "nameservers" {
  description = "Route 53 hosted zone nameservers (already configured in GoDaddy)"
  value       = data.aws_route53_zone.main.name_servers
}

output "site_url" {
  description = "The live site URL"
  value       = "https://${var.domain_name}"
}

output "cognito_user_pool_id" {
  description = "Cognito User Pool ID"
  value       = aws_cognito_user_pool.main.id
}

output "cognito_client_id" {
  description = "Cognito App Client ID (for the frontend)"
  value       = aws_cognito_user_pool_client.app.id
}

output "cognito_domain" {
  description = "Cognito hosted UI domain"
  value       = "https://${aws_cognito_user_pool_domain.main.domain}.auth.${var.aws_region}.amazoncognito.com"
}
