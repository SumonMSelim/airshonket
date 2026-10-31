#!/usr/bin/env bash
# Phase 1: create a cost safety net BEFORE anything else.
#
# Creates an AWS Budgets monthly cost budget of $5 that emails you at 50%, 80%,
# and 100% of forecast/actual. This is free. Run it first so you can never be
# surprised by a bill.
#
# Usage:  NOTIFY_EMAIL=you@example.com bash infra/10_budget.sh

set -euo pipefail
source "$(dirname "$0")/config.sh"

: "${NOTIFY_EMAIL:?Set NOTIFY_EMAIL=you@example.com so the alert can reach you}"

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"

# Budgets is a global service; its endpoint lives in us-east-1.
cat > /tmp/airshonket_budget.json <<JSON
{
  "BudgetName": "${BUDGET_NAME}",
  "BudgetLimit": { "Amount": "5", "Unit": "USD" },
  "TimeUnit": "MONTHLY",
  "BudgetType": "COST"
}
JSON

cat > /tmp/airshonket_notifications.json <<JSON
[
  {
    "Notification": {
      "NotificationType": "ACTUAL",
      "ComparisonOperator": "GREATER_THAN",
      "Threshold": 80,
      "ThresholdType": "PERCENTAGE"
    },
    "Subscribers": [{ "SubscriptionType": "EMAIL", "Address": "${NOTIFY_EMAIL}" }]
  },
  {
    "Notification": {
      "NotificationType": "FORECASTED",
      "ComparisonOperator": "GREATER_THAN",
      "Threshold": 100,
      "ThresholdType": "PERCENTAGE"
    },
    "Subscribers": [{ "SubscriptionType": "EMAIL", "Address": "${NOTIFY_EMAIL}" }]
  }
]
JSON

if aws budgets describe-budget --account-id "${ACCOUNT_ID}" \
     --budget-name "${BUDGET_NAME}" >/dev/null 2>&1; then
  echo "Budget ${BUDGET_NAME} already exists. Leaving it as is."
else
  aws budgets create-budget \
    --account-id "${ACCOUNT_ID}" \
    --budget file:///tmp/airshonket_budget.json \
    --notifications-with-subscribers file:///tmp/airshonket_notifications.json
  echo "Created \$5 budget '${BUDGET_NAME}'. You will get email alerts at 80% actual and 100% forecast."
fi
