#!/usr/bin/env bash
# Dev-only seed: creates two household users and a few sample tickets so the
# board isn't empty on first run. Requires a running PocketBase with a superuser.
#
#   1) start PocketBase (see modules/tickets/README.md)
#   2) create a superuser once:
#        pocketbase superuser upsert admin@house.local housepass123 \
#          --dir modules/tickets/pb_data
#   3) run this script:  bash modules/tickets/scripts/seed-dev.sh
#
# Override defaults via env: PB_URL, SU_EMAIL, SU_PASS, USER_PASS.
set -euo pipefail

PB_URL="${PB_URL:-http://127.0.0.1:8090}"
SU_EMAIL="${SU_EMAIL:-admin@house.local}"
SU_PASS="${SU_PASS:-housepass123}"
USER_PASS="${USER_PASS:-housepass123}"
jqget() { python3 -c "import sys,json;print(json.load(sys.stdin).get('$1',''))"; }

echo "→ authenticating superuser at $PB_URL"
TOKEN=$(curl -s -X POST "$PB_URL/api/collections/_superusers/auth-with-password" \
  -H 'Content-Type: application/json' \
  -d "{\"identity\":\"$SU_EMAIL\",\"password\":\"$SU_PASS\"}" | jqget token)
[ -n "$TOKEN" ] || { echo "!! superuser auth failed — is PocketBase running and the superuser created?"; exit 1; }

mkuser() {
  curl -s -o /dev/null -w "  user $1 -> %{http_code}\n" \
    -X POST "$PB_URL/api/collections/users/records" -H "Authorization: $TOKEN" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1@house.local\",\"password\":\"$USER_PASS\",\"passwordConfirm\":\"$USER_PASS\",\"name\":\"$2\",\"verified\":true}"
}
echo "→ creating users"
mkuser cora Cora || true
mkuser bf BF || true

uid() { curl -s "$PB_URL/api/collections/users/records?filter=(email='$1@house.local')" \
  -H "Authorization: $TOKEN" | python3 -c 'import sys,json;r=json.load(sys.stdin)["items"];print(r[0]["id"] if r else "")'; }
CORA=$(uid cora); BF=$(uid bf)
NOW=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)

mkticket() {
  curl -s -o /dev/null -w "  ticket '$1' -> %{http_code}\n" \
    -X POST "$PB_URL/api/collections/tickets/records" -H "Authorization: $TOKEN" \
    -H 'Content-Type: application/json' -d "$2"
}
echo "→ creating sample tickets"
mkticket "Dishwasher making a grinding noise" "{\"title\":\"Dishwasher making a grinding noise\",\"status\":\"Open\",\"priority\":\"P1\",\"category\":\"repair\",\"assignee\":\"$CORA\",\"created_by\":\"$BF\"}"
mkticket "Plan Christmas travel" "{\"title\":\"Plan Christmas travel\",\"status\":\"In Progress\",\"priority\":\"P3\",\"category\":\"planning\",\"assignee\":\"$BF\",\"created_by\":\"$CORA\"}"
mkticket "Waiting on landlord re: heater" "{\"title\":\"Waiting on landlord re: heater\",\"status\":\"Waiting\",\"priority\":\"P2\",\"category\":\"repair\",\"assignee\":\"$CORA\",\"created_by\":\"$CORA\"}"
mkticket "Take out recycling" "{\"title\":\"Take out recycling\",\"status\":\"Done\",\"priority\":\"P4\",\"category\":\"errand\",\"assignee\":\"$BF\",\"created_by\":\"$CORA\",\"done_by\":\"$BF\",\"done_at\":\"$NOW\"}"

echo "✓ seeded. Log in to the app as cora@house.local / $USER_PASS"
