#!/usr/bin/env bash
#
# Repeatable deploy for coral-admin, one environment at a time.
#
# Pipeline: next build (static export -> out/) -> aws s3 sync -> CloudFront invalidation.
# Infra (buckets + distributions) is provisioned by Terraform in infra/; this script only
# ships the built site content. It never creates or destroys infrastructure.
#
# Environments:
#   production  https://admin.coral.restaurant       DynamoDB tables: coral-prod-*
#   uat         https://admin-uat.coral.restaurant   DynamoDB tables: coral-*
#
# The environment is baked into the static build (NEXT_PUBLIC_APP_ENV), so each
# environment needs its own build. There is deliberately NO default: you must name
# the environment, so a deploy can never go to production by accident.
#
# Usage:
#   ./scripts/deploy.sh production
#   ./scripts/deploy.sh uat
#
# Requirements:
#   - AWS credentials configured (same account as the Terraform state)
#   - terraform installed (used only to read outputs: bucket name + distribution id)
#   - .env.local present (NEXT_PUBLIC_* Cognito values are baked into the static build)

set -euo pipefail

APP_ENV="${1:-}"
case "$APP_ENV" in
  production)
    BUCKET_OUTPUT="s3_bucket_name"
    DISTRIBUTION_OUTPUT="cloudfront_distribution_id"
    URL_OUTPUT="site_url"
    ;;
  uat)
    BUCKET_OUTPUT="uat_s3_bucket_name"
    DISTRIBUTION_OUTPUT="uat_cloudfront_distribution_id"
    URL_OUTPUT="uat_site_url"
    ;;
  *)
    echo "Usage: $0 <production|uat>" >&2
    echo "       An environment is required (no default, on purpose)." >&2
    exit 1
    ;;
esac

# Resolve repo root (this script lives in <root>/scripts).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
INFRA_DIR="$ROOT_DIR/infra"
OUT_DIR="$ROOT_DIR/out"

cd "$ROOT_DIR"

echo "==> Deploying environment: $APP_ENV"
echo "==> Reading deploy targets from terraform outputs"
BUCKET="$(terraform -chdir="$INFRA_DIR" output -raw "$BUCKET_OUTPUT")"
DISTRIBUTION_ID="$(terraform -chdir="$INFRA_DIR" output -raw "$DISTRIBUTION_OUTPUT")"
SITE_URL="$(terraform -chdir="$INFRA_DIR" output -raw "$URL_OUTPUT" 2>/dev/null || echo '(unknown)')"

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

echo "==> Building static export (next build) with NEXT_PUBLIC_APP_ENV=$APP_ENV"
rm -rf "$OUT_DIR"
# A value set here wins over the one in .env.local.
NEXT_PUBLIC_APP_ENV="$APP_ENV" npm run build

if [[ ! -d "$OUT_DIR" ]]; then
  echo "ERROR: build did not produce an 'out/' directory. Is output: 'export' set in next.config.ts?" >&2
  exit 1
fi

# Safety check: make sure the build really targets the intended table set before
# anything is uploaded. Production tables are the only ones prefixed "coral-prod-".
if [[ "$APP_ENV" == "production" ]]; then
  if ! grep -rq 'coral-prod-' "$OUT_DIR/_next/static"; then
    echo "ERROR: production build does not reference coral-prod-* tables. Aborting before upload." >&2
    exit 1
  fi
else
  if grep -rq 'coral-prod-' "$OUT_DIR/_next/static"; then
    echo "ERROR: $APP_ENV build references coral-prod-* tables. Aborting before upload." >&2
    exit 1
  fi
fi
echo "    verified: build targets the $APP_ENV table set"

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
echo "==> Deploy complete ($APP_ENV). Live at: $SITE_URL"
