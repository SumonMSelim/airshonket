#!/usr/bin/env bash
# Phase 2: create the private S3 data bucket and upload the datasets.
#
# The bucket stays private. The public site is served through CloudFront only
# (set up in a later phase). This script is idempotent: re-running it just
# re-uploads the data.
#
# Usage:  bash infra/20_data_bucket.sh

set -euo pipefail
source "$(dirname "$0")/config.sh"

# --- create bucket (ignore error if it already exists and we own it) ---------
if aws s3api head-bucket --bucket "${DATA_BUCKET}" 2>/dev/null; then
  echo "Bucket ${DATA_BUCKET} already exists."
else
  if [ "${AWS_REGION}" = "us-east-1" ]; then
    aws s3api create-bucket --bucket "${DATA_BUCKET}" --region us-east-1
  else
    aws s3api create-bucket --bucket "${DATA_BUCKET}" --region "${AWS_REGION}" \
      --create-bucket-configuration LocationConstraint="${AWS_REGION}"
  fi
  echo "Created bucket ${DATA_BUCKET}."
fi

# --- harden: block all public access (CloudFront reaches it via OAC) ---------
aws s3api put-public-access-block --bucket "${DATA_BUCKET}" \
  --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

# --- upload datasets ---------------------------------------------------------
if [ ! -f "${DATA_DIR}/bd_stations.json" ]; then
  echo "WARNING: ${DATA_DIR}/bd_stations.json missing. Run fetch_bd_stations.py first."
fi

aws s3 cp "${DATA_DIR}/kilns.geojson" "s3://${DATA_BUCKET}/${KILNS_KEY}" \
  --content-type application/geo+json --cache-control "public, max-age=86400"

[ -f "${DATA_DIR}/latest_pm25.geojson" ] && \
  aws s3 cp "${DATA_DIR}/latest_pm25.geojson" "s3://${DATA_BUCKET}/${LATEST_KEY}" \
    --content-type application/geo+json --cache-control "public, max-age=300"

[ -f "${DATA_DIR}/bd_stations.json" ] && \
  aws s3 cp "${DATA_DIR}/bd_stations.json" "s3://${DATA_BUCKET}/${STATIONS_KEY}" \
    --content-type application/json

echo "Data uploaded to s3://${DATA_BUCKET}/data/"
