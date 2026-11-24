# Google Workspace for coral.restaurant (mail moved from Microsoft 365).
#
# These two record sets pre-existed (created in GoDaddy/Microsoft) and were
# imported into Terraform:
#   terraform import aws_route53_record.root_txt Z09591743HS6NWJNWJWQR_coral.restaurant_TXT
#   terraform import aws_route53_record.root_mx  Z09591743HS6NWJNWJWQR_coral.restaurant_MX


# Root TXT: Google verification and Google SPF.
resource "aws_route53_record" "root_txt" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = var.root_domain
  type    = "TXT"
  ttl     = 3600
  records = [
    "google-site-verification=bwL5J4ruR6QBpqlhZooCzofq8ueyoF63NTE9_V-yus0",
    "v=spf1 include:_spf.google.com -all",
  ]
}


# Root MX: Google Workspace mail.
resource "aws_route53_record" "root_mx" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = var.root_domain
  type    = "MX"
  ttl     = 3600
  records = ["1 smtp.google.com."]
}
