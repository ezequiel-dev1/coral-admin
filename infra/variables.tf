variable "aws_region" {
  description = "AWS region for the infrastructure"
  type        = string
  default     = "us-east-1" # Required for CloudFront ACM certificates
}

variable "domain_name" {
  description = "The subdomain to host the app"
  type        = string
  default     = "admin.coral.restaurant"
}

variable "root_domain" {
  description = "The root domain (registered in GoDaddy)"
  type        = string
  default     = "coral.restaurant"
}

variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "production"
}
