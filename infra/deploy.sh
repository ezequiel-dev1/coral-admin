#!/bin/bash
set -euo pipefail

# Deploy script: builds the Next.js static export and syncs to S3.
# Usage: ./infra/deploy.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

# Get Terraform outputs
S3_BUCKET=$(cd infra && terraform output -raw s3_bucket_name)
CF_DISTRIBUTION=$(cd infra && terraform output -raw cloudfront_distribution_id)

echo "==> Building Next.js static export..."
npm run build

echo "==> Syncing to S3 bucket: $S3_BUCKET"
aws s3 sync out/ "s3://$S3_BUCKET" --delete \
  --cache-control "public, max-age=31536000, immutable" \
  --exclude "*.html"

# HTML files get shorter cache (for updates)
aws s3 sync out/ "s3://$S3_BUCKET" --delete \
  --cache-control "public, max-age=0, must-revalidate" \
  --include "*.html"

echo "==> Invalidating CloudFront cache..."
aws cloudfront create-invalidation \
  --distribution-id "$CF_DISTRIBUTION" \
  --paths "/*" \
  --no-cli-pager

echo "==> Done! Site will be live at https://admin.coral.restaurant shortly."
