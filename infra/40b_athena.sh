#!/usr/bin/env bash
# Phase 4b: create the Athena database and external table over the PM2.5
# snapshots the Lambda writes to S3. Uses partition projection so no crawler
# or manual partition management is needed.
#
# Athena needs a query-results location. We use a prefix in the data bucket.
#
# Usage:  bash infra/40b_athena.sh

set -euo pipefail
source "$(dirname "$0")/config.sh"

RESULTS="s3://${DATA_BUCKET}/athena-results/"

# Substitute the bucket into the DDL template.
DDL="$(sed "s|<DATA_BUCKET>|${DATA_BUCKET}|g" "$(dirname "$0")/athena/create_table.sql")"

run_sql () {
  local sql="$1"
  local qid
  qid="$(aws athena start-query-execution \
    --query-string "${sql}" \
    --result-configuration "OutputLocation=${RESULTS}" \
    --region "${AWS_REGION}" \
    --query QueryExecutionId --output text)"
  # Wait for completion.
  while true; do
    local state
    state="$(aws athena get-query-execution --query-execution-id "${qid}" \
      --region "${AWS_REGION}" \
      --query QueryExecution.Status.State --output text)"
    case "${state}" in
      SUCCEEDED) echo "  query ${qid} OK"; return 0 ;;
      FAILED|CANCELLED)
        echo "  query ${qid} ${state}"
        aws athena get-query-execution --query-execution-id "${qid}" \
          --region "${AWS_REGION}" \
          --query QueryExecution.Status.StateChangeReason --output text
        return 1 ;;
      *) sleep 2 ;;
    esac
  done
}

echo "Creating Athena database and table ..."
# The DDL file contains two statements (CREATE DATABASE, CREATE TABLE).
# Athena runs one statement per execution, so split on the semicolon.
CREATE_DB="$(printf '%s\n' "${DDL}" | awk 'BEGIN{RS=";"} /CREATE DATABASE/{print $0";"}')"
CREATE_TBL="$(printf '%s\n' "${DDL}" | awk 'BEGIN{RS=";"} /CREATE EXTERNAL TABLE/{print $0";"}')"

run_sql "${CREATE_DB}"
run_sql "${CREATE_TBL}"

echo "Athena ready. Try the daily average query:"
echo "  aws athena start-query-execution \\"
echo "    --query-string \"\$(cat infra/athena/daily_city_average.sql)\" \\"
echo "    --result-configuration OutputLocation=${RESULTS} --region ${AWS_REGION}"
