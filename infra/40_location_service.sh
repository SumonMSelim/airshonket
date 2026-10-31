#!/usr/bin/env bash
# Phase 4: create an Amazon Location Service map resource and an API key, then
# print the style URL to paste into web/config.js.
#
# This is the AWS "location service" the hackathon asks for. The map renders
# with proper Bangladesh labels and boundaries.
#
# Note: Amazon Location has two generations of APIs. This script uses the
# v2 "maps" style-descriptor endpoint with an API key, which MapLibre loads
# directly. If your account/region exposes a different resource shape, see the
# fallback notes in infra/README.md.
#
# Usage:  bash infra/40_location_service.sh

set -euo pipefail
source "$(dirname "$0")/config.sh"

KEY_NAME="airshonket-maps-key"

# Create an API key scoped to map tile rendering only.
# The exact allowed actions can vary by region; geo-maps:GetTile is the v2 one.
if aws location describe-key --key-name "${KEY_NAME}" --region "${AWS_REGION}" >/dev/null 2>&1; then
  echo "API key ${KEY_NAME} already exists."
else
  aws location create-key \
    --key-name "${KEY_NAME}" \
    --region "${AWS_REGION}" \
    --no-cli-pager \
    --restrictions '{
      "AllowActions": ["geo-maps:GetTile", "geo-maps:GetStyleDescriptor"],
      "AllowResources": ["*"]
    }' || {
      echo
      echo "create-key failed. Your region may use the v1 Maps API."
      echo "See infra/README.md for the v1 fallback (create-map + map name in the style URL)."
      exit 1
    }
  echo "Created API key ${KEY_NAME}."
fi

API_KEY="$(aws location describe-key --key-name "${KEY_NAME}" \
  --region "${AWS_REGION}" --query Key --output text)"

# The v2 style-descriptor URL that MapLibre loads. The exact host/path has
# been stable as below, but CONFIRM it against your account before relying on
# it: open the printed URL in a browser; a valid style returns JSON starting
# with {"version":8,...}. If it 404s, check the AWS console "Maps" page for the
# exact style name and descriptor URL and use that instead.
STYLE_URL="https://maps.geo.${AWS_REGION}.amazonaws.com/v2/styles/Standard/descriptor?key=${API_KEY}&color-scheme=Light"

echo
echo "Amazon Location Service is ready."
echo
echo "1. Verify the style URL returns JSON (version 8). Run:"
echo "     curl -s '${STYLE_URL}' | head -c 80"
echo "   You should see: {\"version\":8,..."
echo
echo "2. If valid, paste it into web/config.js as LOCATION_STYLE_URL:"
echo
echo "     ${STYLE_URL}"
echo
echo "The key is restricted to map tile actions, so using it in a public static"
echo "site is the intended design. Once the CloudFront domain is known, add a"
echo "referer restriction to the key to lock it to that domain."
