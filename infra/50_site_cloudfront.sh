#!/usr/bin/env bash
# Phase 5: publish the static site via CloudFront in front of the private S3
# bucket. The bucket stays private; CloudFront reaches it with an Origin
# Access Control (OAC). This makes the map live and public over HTTPS.
#
# Uploads web/ to s3://DATA_BUCKET/web/ and serves it at the CloudFront root.
#
# Usage:  bash infra/50_site_cloudfront.sh

set -euo pipefail
source "$(dirname "$0")/config.sh"

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"

# --- upload the site files ---------------------------------------------------
aws s3 sync "${WEB_DIR}" "s3://${DATA_BUCKET}/${SITE_PREFIX}/" \
  --exclude ".*" --delete \
  --cache-control "public, max-age=300"
echo "Uploaded site to s3://${DATA_BUCKET}/${SITE_PREFIX}/"

# --- Origin Access Control (idempotent) --------------------------------------
OAC_ID="$(aws cloudfront list-origin-access-controls \
  --query "OriginAccessControlList.Items[?Name=='airshonket-oac'].Id | [0]" \
  --output text 2>/dev/null || true)"
if [ -z "${OAC_ID}" ] || [ "${OAC_ID}" = "None" ]; then
  OAC_ID="$(aws cloudfront create-origin-access-control \
    --origin-access-control-config '{
      "Name": "airshonket-oac",
      "SigningProtocol": "sigv4",
      "SigningBehavior": "always",
      "OriginAccessControlOriginType": "s3"
    }' --query OriginAccessControl.Id --output text)"
  echo "Created Origin Access Control ${OAC_ID}."
fi

# --- CloudFront distribution --------------------------------------------------
# Reuse an existing distribution tagged for this project if present.
DIST_ID="$(aws cloudfront list-distributions \
  --query "DistributionList.Items[?Comment=='airshonket'].Id | [0]" \
  --output text 2>/dev/null || true)"

ORIGIN_DOMAIN="${DATA_BUCKET}.s3.${AWS_REGION}.amazonaws.com"

if [ -z "${DIST_ID}" ] || [ "${DIST_ID}" = "None" ]; then
  cat > /tmp/airshonket_dist.json <<JSON
{
  "CallerReference": "airshonket-$(date +%s)",
  "Comment": "airshonket",
  "Enabled": true,
  "DefaultRootObject": "${SITE_PREFIX}/index.html",
  "Origins": {
    "Quantity": 1,
    "Items": [{
      "Id": "s3-origin",
      "DomainName": "${ORIGIN_DOMAIN}",
      "OriginAccessControlId": "${OAC_ID}",
      "S3OriginConfig": { "OriginAccessIdentity": "" }
    }]
  },
  "DefaultCacheBehavior": {
    "TargetOriginId": "s3-origin",
    "ViewerProtocolPolicy": "redirect-to-https",
    "CachePolicyId": "658327ea-f89d-4fab-a63d-7e88639e58f6",
    "Compress": true
  },
  "PriceClass": "PriceClass_100"
}
JSON
  DIST_ID="$(aws cloudfront create-distribution \
    --distribution-config file:///tmp/airshonket_dist.json \
    --query Distribution.Id --output text)"
  echo "Created CloudFront distribution ${DIST_ID}."
fi

DIST_DOMAIN="$(aws cloudfront get-distribution --id "${DIST_ID}" \
  --query Distribution.DomainName --output text)"

# --- bucket policy: allow only this distribution to read ---------------------
aws s3api put-bucket-policy --bucket "${DATA_BUCKET}" --policy "{
  \"Version\": \"2012-10-17\",
  \"Statement\": [{
    \"Sid\": \"AllowCloudFrontRead\",
    \"Effect\": \"Allow\",
    \"Principal\": { \"Service\": \"cloudfront.amazonaws.com\" },
    \"Action\": \"s3:GetObject\",
    \"Resource\": \"arn:aws:s3:::${DATA_BUCKET}/*\",
    \"Condition\": {
      \"StringEquals\": {
        \"AWS:SourceArn\": \"arn:aws:cloudfront::${ACCOUNT_ID}:distribution/${DIST_ID}\"
      }
    }
  }]
}"

echo
echo "Site publishing set up."
echo "CloudFront domain (allow ~10 min for first deploy):"
echo "  https://${DIST_DOMAIN}/"
echo
echo "Because web/ is served from a prefix, the map also needs its data at the"
echo "same origin. The app fetches ../data/..., which resolves to /data/... at"
echo "the CloudFront root, so data uploaded by phase 2 is already reachable."
