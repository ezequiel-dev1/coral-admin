# UAT site (admin-uat.coral.restaurant)
#
# A parallel copy of the site stack in main.tf: its own S3 bucket, ACM
# certificate, CloudFront distribution and Route 53 record. main.tf serves the
# production site (admin.coral.restaurant) and is intentionally left untouched.
#
# The UAT build is made with NEXT_PUBLIC_APP_ENV=uat (see scripts/deploy.sh),
# which points the app at the coral-* DynamoDB tables.

# --- S3 Bucket for the UAT static site ---

resource "aws_s3_bucket" "uat_site" {
  bucket = "${replace(var.uat_domain_name, ".", "-")}-site"

  tags = {
    Name        = var.uat_domain_name
    Environment = "UAT"
  }
}

resource "aws_s3_bucket_public_access_block" "uat_site" {
  bucket = aws_s3_bucket.uat_site.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# --- CloudFront Origin Access Control ---

resource "aws_cloudfront_origin_access_control" "uat_site" {
  name                              = "${var.uat_domain_name}-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# --- ACM Certificate (must be in us-east-1 for CloudFront) ---

resource "aws_acm_certificate" "uat_site" {
  domain_name       = var.uat_domain_name
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name        = var.uat_domain_name
    Environment = "UAT"
  }
}

# --- ACM DNS validation via the existing Route 53 zone (data.aws_route53_zone.main) ---

resource "aws_route53_record" "uat_cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.uat_site.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  allow_overwrite = true
  name            = each.value.name
  records         = [each.value.record]
  ttl             = 60
  type            = each.value.type
  zone_id         = data.aws_route53_zone.main.zone_id
}

resource "aws_acm_certificate_validation" "uat_site" {
  certificate_arn         = aws_acm_certificate.uat_site.arn
  validation_record_fqdns = [for record in aws_route53_record.uat_cert_validation : record.fqdn]
}

# --- CloudFront Distribution ---

resource "aws_cloudfront_distribution" "uat_site" {
  enabled             = true
  default_root_object = "index.html"
  aliases             = [var.uat_domain_name]
  price_class         = "PriceClass_100"

  origin {
    domain_name              = aws_s3_bucket.uat_site.bucket_regional_domain_name
    origin_id                = "s3-uat-site"
    origin_access_control_id = aws_cloudfront_origin_access_control.uat_site.id
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "s3-uat-site"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.html_rewrite.arn
    }

    min_ttl     = 0
    default_ttl = 3600
    max_ttl     = 86400
  }

  # UAT API Gateway (Stripe test mode / Uber). See api-uat.tf.
  origin {
    domain_name = replace(aws_apigatewayv2_api.api_uat.api_endpoint, "https://", "")
    origin_id   = "api-uat"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  # /api/* is never cached and forwards everything except the Host header.
  ordered_cache_behavior {
    path_pattern           = "/api/*"
    allowed_methods        = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "api-uat"
    viewer_protocol_policy = "https-only"
    compress               = true

    # Managed policies: CachingDisabled / AllViewerExceptHostHeader
    cache_policy_id          = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"
    origin_request_policy_id = "b689b0a8-53d0-40ab-baf2-68738e2966ac"
  }

  # SPA fallback: same behavior as the production distribution.
  custom_error_response {
    error_code         = 403
    response_code      = 200
    response_page_path = "/index.html"
  }

  custom_error_response {
    error_code         = 404
    response_code      = 200
    response_page_path = "/404.html"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.uat_site.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  tags = {
    Name        = var.uat_domain_name
    Environment = "UAT"
  }
}

# --- Route 53 A record pointing to CloudFront ---

resource "aws_route53_record" "uat_site" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = var.uat_domain_name
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.uat_site.domain_name
    zone_id                = aws_cloudfront_distribution.uat_site.hosted_zone_id
    evaluate_target_health = false
  }
}

# --- S3 bucket policy: only this CloudFront distribution may read the bucket ---

resource "aws_s3_bucket_policy" "uat_site" {
  bucket = aws_s3_bucket.uat_site.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowCloudFrontServicePrincipal"
        Effect    = "Allow"
        Principal = { Service = "cloudfront.amazonaws.com" }
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.uat_site.arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.uat_site.arn
          }
        }
      }
    ]
  })
}
