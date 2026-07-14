#!/bin/bash

# Toggle the mock-gateway mode
# Usage: ./toggle-gateway-failure.sh [success|failure|timeout]

MODE=${1:-failure}

if [[ ! "$MODE" =~ ^(success|failure|timeout)$ ]]; then
  echo "Invalid mode. Use: success, failure, or timeout"
  exit 1
fi

echo "Setting mock-gateway to $MODE mode..."
curl -X POST http://localhost:4000/admin/mode \
  -H "Content-Type: application/json" \
  -d "{\"mode\":\"$MODE\"}"

echo -e "\nDone!"
