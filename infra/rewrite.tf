# Static export writes routes as <route>.html (e.g. checkout/return.html), but the
# S3 REST origin does no index/extension resolution. Without this rewrite,
# /checkout/return -> S3 403 -> SPA fallback -> index.html (the login-gated dashboard).
resource "aws_cloudfront_function" "html_rewrite" {
  name    = "coral-admin-html-rewrite"
  runtime = "cloudfront-js-2.0"
  comment = "Map extensionless paths to .html objects in the static export"
  publish = true
  code    = <<-EOT
    function handler(event) {
      var request = event.request;
      var uri = request.uri;
      if (uri.endsWith('/')) {
        request.uri = uri + 'index.html';
      } else if (uri.split('/').pop().indexOf('.') === -1) {
        request.uri = uri + '.html';
      }
      return request;
    }
  EOT
}
