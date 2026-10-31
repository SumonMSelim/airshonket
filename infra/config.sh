#!/usr/bin/env bash
# Shared configuration for AirShonket infrastructure scripts.
#
# Edit these values if you want different names or a different region, then
# source this file (the deploy scripts do that for you).
#
# Nothing here creates resources. It only sets names used by the other scripts.

set -euo pipefail

# AWS region. Dhaka is well served by ap-south-1 (Mumbai) or ap-southeast-1
# (Singapore). us-east-1 is fine too and is where the OpenAQ archive lives.
export AWS_REGION="${AWS_REGION:-ap-south-1}"

# A short suffix to keep bucket names globally unique. Change if taken.
export SUFFIX="${SUFFIX:-bd1}"

# Resource names.
export DATA_BUCKET="airshonket-data-${SUFFIX}"
export LAMBDA_NAME="airshonket-ingest"
export LAMBDA_ROLE="airshonket-ingest-role"
export SCHEDULE_NAME="airshonket-ingest-30min"
export ATHENA_DB="airshonket"
export ATHENA_WORKGROUP="airshonket-wg"
export BUDGET_NAME="airshonket-budget"

# Key layout inside the data bucket.
export STATIONS_KEY="data/bd_stations.json"
export KILNS_KEY="data/kilns.geojson"
export LATEST_KEY="data/latest_pm25.geojson"
export SNAPSHOT_PREFIX="snapshots"
export SITE_PREFIX="web"           # static site files live under this prefix

# Local paths.
export ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export DATA_DIR="${ROOT_DIR}/data"
export WEB_DIR="${ROOT_DIR}/web"
export LAMBDA_DIR="${ROOT_DIR}/pipeline/lambda"

# Guard: every script that sources this uses an explicit profile if AWS_PROFILE
# is set by the user. We leave credentials entirely to the environment.
echo "AirShonket infra config:"
echo "  region        ${AWS_REGION}"
echo "  data bucket   ${DATA_BUCKET}"
echo "  lambda        ${LAMBDA_NAME}"
echo "  athena db     ${ATHENA_DB}"
