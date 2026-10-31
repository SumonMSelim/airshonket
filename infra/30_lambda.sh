#!/usr/bin/env bash
# Phase 3: deploy the ingest Lambda and schedule it with EventBridge.
#
# Creates (idempotently):
#   - an IAM role the Lambda runs as, scoped to our data bucket only
#   - the Lambda function from pipeline/lambda/handler.py
#   - an EventBridge rule that runs it every 30 minutes
#
# boto3 is bundled in the Lambda Python runtime, so the zip is just our handler.
#
# Usage:  bash infra/30_lambda.sh

set -euo pipefail
source "$(dirname "$0")/config.sh"

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${LAMBDA_ROLE}"

# --- IAM role ----------------------------------------------------------------
if ! aws iam get-role --role-name "${LAMBDA_ROLE}" >/dev/null 2>&1; then
  aws iam create-role --role-name "${LAMBDA_ROLE}" \
    --assume-role-policy-document '{
      "Version": "2012-10-17",
      "Statement": [{
        "Effect": "Allow",
        "Principal": { "Service": "lambda.amazonaws.com" },
        "Action": "sts:AssumeRole"
      }]
    }'
  aws iam attach-role-policy --role-name "${LAMBDA_ROLE}" \
    --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
  echo "Created role ${LAMBDA_ROLE}; waiting for propagation ..."
  sleep 10
fi

# Least-privilege inline policy: read+write only our data bucket.
aws iam put-role-policy --role-name "${LAMBDA_ROLE}" \
  --policy-name airshonket-data-access \
  --policy-document "{
    \"Version\": \"2012-10-17\",
    \"Statement\": [{
      \"Effect\": \"Allow\",
      \"Action\": [\"s3:GetObject\", \"s3:PutObject\", \"s3:ListBucket\"],
      \"Resource\": [
        \"arn:aws:s3:::${DATA_BUCKET}\",
        \"arn:aws:s3:::${DATA_BUCKET}/*\"
      ]
    }]
  }"

# --- package -----------------------------------------------------------------
BUILD="$(mktemp -d)"
cp "${LAMBDA_DIR}/handler.py" "${BUILD}/"
( cd "${BUILD}" && zip -q handler.zip handler.py )

# --- create or update function ----------------------------------------------
ENV_VARS="Variables={DATA_BUCKET=${DATA_BUCKET},STATIONS_KEY=${STATIONS_KEY},LATEST_KEY=${LATEST_KEY},SNAPSHOT_PREFIX=${SNAPSHOT_PREFIX},DAYS_BACK=5}"

if aws lambda get-function --function-name "${LAMBDA_NAME}" >/dev/null 2>&1; then
  aws lambda update-function-code --function-name "${LAMBDA_NAME}" \
    --zip-file "fileb://${BUILD}/handler.zip" >/dev/null
  aws lambda update-function-configuration --function-name "${LAMBDA_NAME}" \
    --timeout 120 --memory-size 256 --environment "${ENV_VARS}" >/dev/null
  echo "Updated Lambda ${LAMBDA_NAME}."
else
  aws lambda create-function --function-name "${LAMBDA_NAME}" \
    --runtime python3.12 --handler handler.handler \
    --role "${ROLE_ARN}" \
    --zip-file "fileb://${BUILD}/handler.zip" \
    --timeout 120 --memory-size 256 \
    --environment "${ENV_VARS}" >/dev/null
  echo "Created Lambda ${LAMBDA_NAME}."
fi
rm -rf "${BUILD}"

# --- EventBridge schedule: every 30 minutes ----------------------------------
RULE_ARN="$(aws events put-rule --name "${SCHEDULE_NAME}" \
  --schedule-expression 'rate(30 minutes)' \
  --query RuleArn --output text)"

aws lambda add-permission --function-name "${LAMBDA_NAME}" \
  --statement-id "${SCHEDULE_NAME}-invoke" \
  --action lambda:InvokeFunction --principal events.amazonaws.com \
  --source-arn "${RULE_ARN}" >/dev/null 2>&1 || true

LAMBDA_ARN="$(aws lambda get-function --function-name "${LAMBDA_NAME}" \
  --query Configuration.FunctionArn --output text)"
aws events put-targets --rule "${SCHEDULE_NAME}" \
  --targets "Id=1,Arn=${LAMBDA_ARN}" >/dev/null

echo "Scheduled ${LAMBDA_NAME} every 30 minutes via ${SCHEDULE_NAME}."
echo "Test it now with:  aws lambda invoke --function-name ${LAMBDA_NAME} /tmp/out.json && cat /tmp/out.json"
