#!/usr/bin/env bash
#
# One-command deploy for AirShonket.
#
# Why this script exists: the Amazon Location API key value is not returned by
# CloudFormation (no Fn::GetAtt for the key material), so it cannot be injected
# into the site during `cdk deploy`. We never want the key in source either.
# So the flow is:
#   1. cdk deploy          (ships the app, with a null runtime-config.js)
#   2. describe-key        (fetch the key value from Amazon Location)
#   3. write runtime-config.js straight into the bucket, with the key
#   4. invalidate CloudFront so the new config and data are served
#
# The key lives only in S3 (a restricted, tile-only key that is safe to serve
# to browsers) and never in the repository.
#
# Usage:
#   ./deploy.sh
#
# Requires AWS credentials for the target account (profile sumonmselim) and the
# custom-domain context values below.

set -euo pipefail

PROFILE="${AWS_PROFILE:-sumonmselim}"
ACCOUNT="${CDK_DEFAULT_ACCOUNT:-507044010153}"
REGION="${CDK_DEFAULT_REGION:-us-east-1}"
SITE_DOMAIN="${SITE_DOMAIN:-airshonket.mol.la}"
SITE_CERT_ARN="${SITE_CERT_ARN:-arn:aws:acm:us-east-1:507044010153:certificate/613b9d58-b68d-49cf-bac7-92e14b6a3364}"
MAP_KEY_NAME="airshonket-maps-key"

here="$(cd "$(dirname "$0")" && pwd)"
cd "$here"

echo "==> Building CDK"
npm run build

echo "==> Deploying stack"
AWS_PROFILE="$PROFILE" CDK_DEFAULT_ACCOUNT="$ACCOUNT" CDK_DEFAULT_REGION="$REGION" \
  npx cdk deploy --require-approval never \
  -c siteDomain="$SITE_DOMAIN" \
  -c siteCertArn="$SITE_CERT_ARN" \
  --outputs-file cdk-outputs.json

BUCKET="$(python3 -c "import json;print(json.load(open('cdk-outputs.json'))['AirshonketStack']['DataBucketName'])")"
echo "==> Bucket: $BUCKET"

echo "==> Fetching Amazon Location key value"
KEY="$(aws location describe-key --key-name "$MAP_KEY_NAME" --region "$REGION" --profile "$PROFILE" --query Key --output text)"
if [ -z "$KEY" ] || [ "$KEY" = "None" ]; then
  echo "ERROR: could not fetch map key value" >&2
  exit 1
fi
STYLE_URL="https://maps.geo.${REGION}.amazonaws.com/v2/styles/Standard/descriptor?key=${KEY}&color-scheme=Light"

echo "==> Writing runtime-config.js into the bucket (key stays out of source)"
TMP="$(mktemp)"
printf '// Generated at deploy time. Do not edit. Not committed.\nglobalThis.__AIRSHONKET_STYLE_URL__ = %s;\n' \
  "$(python3 -c "import json,sys;print(json.dumps(sys.argv[1]))" "$STYLE_URL")" > "$TMP"
aws s3 cp "$TMP" "s3://${BUCKET}/runtime-config.js" \
  --content-type "application/javascript" \
  --cache-control "public, max-age=300" \
  --region "$REGION" --profile "$PROFILE"
rm -f "$TMP"

echo "==> Invalidating CloudFront"
DIST_ID="$(aws cloudfront list-distributions --profile "$PROFILE" \
  --query "DistributionList.Items[?Comment=='airshonket'].Id | [0]" --output text)"
aws cloudfront create-invalidation --distribution-id "$DIST_ID" \
  --paths "/runtime-config.js" "/config.js" "/app.js" "/index.html" "/data/*" \
  --profile "$PROFILE" --query "Invalidation.{Id:Id,Status:Status}" --output json

echo "==> Done. Site: https://${SITE_DOMAIN}/"
