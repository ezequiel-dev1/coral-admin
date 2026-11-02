#!/usr/bin/env bash
#
# Repeatable production deploy for coral-admin.
#
# Pipeline: next build (static export -> out/) -> aws s3 sync -> CloudFront invalidation.
# Infra (bucket + distribution) is provisioned by Terraform in infra/; this script only
# ships the built site content. It never creates or destroys infrastructure.
#
# Usage:
#   ./scripts/deploy.sh
#
# Requirements:
#   - AWS credentials configured (same account as the Terraform state)
#   - terraform installed (used only to read outputs: bucket name + distribution id)
#   - .env.local present (NEXT_PUBLIC_* Cognito values are baked into the static build)

set -euo pipefail

# Resolve repo root (this script lives in <root>/scripts).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
INFRA_DIR="$ROOT_DIR/infra"
OUT_DIR="$ROOT_DIR/out"

cd "$ROOT_DIR"

echo "==> Reading deploy targets from terraform outputs"
BUCKET="$(terraform -chdir="$INFRA_DIR" output -raw s3_bucket_name)"
DISTRIBUTION_ID="$(terraform -chdir="$INFRA_DIR" output -raw cloudfront_distribution_id)"
SITE_URL="$(terraform -chdir="$INFRA_DIR" output -raw site_url 2>/dev/null || echo '(unknown)')"

if [[ -z "$BUCKET" || -z "$DISTRIBUTION_ID" ]]; then
  echo "ERROR: could not resolve bucket or distribution id from terraform output." >&2
  echo "       Run 'terraform apply' in infra/ first." >&2
  exit 1
fi

echo "    bucket:       $BUCKET"
echo "    distribution: $DISTRIBUTION_ID"
echo "    site:         $SITE_URL"

if [[ ! -f "$ROOT_DIR/.env.local" ]]; then
  echo "WARNING: .env.local not found. The static build may be missing NEXT_PUBLIC_* values." >&2
  echo "         Copy .env.local.example to .env.local and fill in Cognito values." >&2
fi

echo "==> Building static export (next build)"
rm -rf "$OUT_DIR"
npm run build

if [[ ! -d "$OUT_DIR" ]]; then
  echo "ERROR: build did not produce an 'out/' directory. Is output: 'export' set in next.config.ts?" >&2
  exit 1
fi

echo "==> Syncing hashed assets (long-lived immutable cache)"
# Everything except HTML: fingerprinted by Next, safe to cache for a year.
aws s3 sync "$OUT_DIR" "s3://$BUCKET" \
  --delete \
  --exclude "*.html" \
  --cache-control "public,max-age=31536000,immutable"

echo "==> Syncing HTML (no-cache so new deploys are picked up immediately)"
aws s3 sync "$OUT_DIR" "s3://$BUCKET" \
  --delete \
  --exclude "*" \
  --include "*.html" \
  --cache-control "public,max-age=0,must-revalidate"

echo "==> Invalidating CloudFront cache"
INVALIDATION_ID="$(aws cloudfront create-invalidation \
  --distribution-id "$DISTRIBUTION_ID" \
  --paths "/*" \
  --query 'Invalidation.Id' --output text)"

echo "    invalidation: $INVALIDATION_ID"
echo "==> Deploy complete. Live at: $SITE_URL"
