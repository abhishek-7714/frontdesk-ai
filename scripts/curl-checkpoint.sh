#!/usr/bin/env bash
# Phase 2 checkpoint: drive one call through every tool endpoint with curl.
# Usage: BASE=http://localhost:3100 ADMIN_TOKEN=... bash scripts/curl-checkpoint.sh
set -euo pipefail
BASE=${BASE:-http://localhost:3100}
j() { curl -s -X POST "$BASE$1" -H 'content-type: application/json' -d "$2"; echo; }

CALL=$(curl -s -X POST "$BASE/api/calls" | sed -E 's/.*"call_id":"([^"]+)".*/\1/')
echo "call_id=$CALL"
j /api/calls/$CALL/transcript '{"role":"patient","text":"What should I bring for a knee appointment?"}'
j /api/tools/search_policy "{\"call_id\":\"$CALL\",\"query\":\"what should I bring for a knee appointment\"}"
AV=$(j /api/tools/check_availability "{\"call_id\":\"$CALL\",\"specialty\":\"ortho\",\"day_preference\":\"this week\"}")
echo "$AV"
SLOT=$(echo "$AV" | sed -E 's/.*"slot_id":([0-9]+).*/\1/')   # last slot offered
j /api/tools/book_appointment "{\"call_id\":\"$CALL\",\"slot_id\":$SLOT,\"patient_name\":\"Abhishek Jain\",\"patient_phone\":\"98765 43210\",\"reason\":\"Knee pain, 2 weeks\"}"
j /api/tools/book_appointment "{\"call_id\":\"$CALL\",\"slot_id\":$SLOT,\"patient_name\":\"Abhishek Jain\",\"patient_phone\":\"98765 43210\",\"reason\":\"Knee pain, 2 weeks\"}"   # idempotent repeat
j /api/tools/save_intake "{\"call_id\":\"$CALL\",\"chief_complaint\":\"Right knee pain\",\"duration\":\"two weeks\"}"
j /api/tools/save_intake "{\"call_id\":\"$CALL\",\"chief_complaint\":\"Right knee pain\",\"severity\":\"moderate, worse on stairs\",\"current_medications\":\"none\"}"
j /api/calls/$CALL/end '{}'
