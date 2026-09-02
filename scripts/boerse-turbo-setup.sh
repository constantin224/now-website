#!/bin/bash
# Kauf-Turbo-Setup: Envs + Shopify-Webhook-Abo für orders/create.
#
# Was danach gilt (seit 02.09. abends = KAUF-NACHLAUF, lib/ticker/nachlauf.ts):
# Bei jeder ECHTEN Ticket-Bestellung antwortet der Webhook sofort und zieht
# danach selbst nach (Ledger-Pass mit Bestell-ID, dann Börsen-Tick) — der
# Preis ist ~10–15 s nach dem Kauf aktuell. Der 5-min-Cron bleibt der Fallback.
# QSTASH_TOKEN braucht die App dafür NICHT mehr (wird hier noch gesetzt —
# harmlos, historisch: der frühere Turbo publizierte drei QStash-Messages).
#
# REIHENFOLGE IST SICHERHEITSRELEVANT: Erst Envs, dann Deploy, ERST DANN das
# Shopify-Abo — ein Abo auf eine Route ohne SHOPIFY_WEBHOOK_SECRET gäbe nur
# 401er, und Shopify löscht Abos nach anhaltenden Fehlern.
set -euo pipefail
cd "$(dirname "$0")/.."

SITE="https://now-music.at"
STORE="03e6c1.myshopify.com"
API_VERSION="2026-04"
CLIENT_ID="aec9c6c4f780fd9d0a082bd97e501392"

schritt() { printf '\n\033[1m== %s ==\033[0m\n' "$1"; }
fehler()  { printf '\n\033[31mABBRUCH: %s\033[0m\n' "$1"; exit 1; }

HDIR=$(mktemp -d) && chmod 700 "$HDIR"
trap 'rm -rf "$HDIR"' EXIT

# ---------- 0. Secrets einsammeln ----------
schritt "0/4 Secrets"
QTK=$(security find-generic-password -a qstash -s tonherd-tickets-qstash-token -w) || fehler "Keychain tonherd-tickets-qstash-token fehlt"
SCS=$(security find-generic-password -s tonherd-shopify-client-secret -w) || fehler "Keychain tonherd-shopify-client-secret fehlt"

# CRON_SECRET des TICKET-Systems (für den verzögerten Ledger-Pass) aus dessen
# Vercel-Projekt ziehen — liegt nirgends im Keychain.
( cd ../tonherd-tickets && vercel env pull "$HDIR/tickets-envs" --environment=production --yes >/dev/null 2>&1 ) || fehler "vercel env pull im tonherd-tickets-Ordner (Projekt gelinkt?)"
TCS=$( (grep '^CRON_SECRET=' "$HDIR/tickets-envs" || true) | cut -d= -f2- | sed -E 's/^"//; s/"$//; s/\\n$//')
[ -n "$TCS" ] || fehler "CRON_SECRET nicht in tonherd-tickets gefunden"
echo "Secrets da."

# ---------- 1. Envs in now-website ----------
schritt "1/4 Vercel-Envs (now-website)"
# WERTE erzwingen, nicht nur Existenz: Ein altes SHOPIFY_WEBHOOK_SECRET würde
# sonst stehen bleiben — das frisch angelegte Abo signierte dann mit dem
# App-Secret, die Route prüfte den Alt-Wert → Dauer-401 bis zur Abo-Löschung.
env_erzwingen() {
  local name="$1" wert="$2"
  vercel env rm "$name" production --yes >/dev/null 2>&1 || true
  printf '%s' "$wert" | vercel env add "$name" production >/dev/null 2>&1 || fehler "env add $name"
  echo "$name: gesetzt (Wert erzwungen)"
}
env_erzwingen QSTASH_TOKEN "$QTK"
env_erzwingen TICKETS_CRON_SECRET "$TCS"
# Shopify signiert per API angelegte Webhooks mit dem CLIENT-SECRET der
# anlegenden App — genau das prüft die Route als SHOPIFY_WEBHOOK_SECRET.
env_erzwingen SHOPIFY_WEBHOOK_SECRET "$SCS"

# ---------- 2. Deploy ----------
schritt "2/4 Deploy (vercel --prod)"
vercel --prod 2>&1 | tail -3 || fehler "Deploy fehlgeschlagen"

# ---------- 3. Shopify-Webhook-Abo (idempotent) ----------
schritt "3/4 Shopify-Abo orders/create"
TOKEN=$(curl -sf "https://$STORE/admin/oauth/access_token" \
  -H "Content-Type: application/json" \
  -d "{\"grant_type\":\"client_credentials\",\"client_id\":\"$CLIENT_ID\",\"client_secret\":\"$SCS\"}" \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['access_token'])") || fehler "Shopify-Token"
printf 'X-Shopify-Access-Token: %s\n' "$TOKEN" > "$HDIR/tok"

VORHANDENE=$(curl -sf "https://$STORE/admin/api/$API_VERSION/graphql.json" \
  -H @"$HDIR/tok" -H "Content-Type: application/json" \
  -d '{"query":"{ webhookSubscriptions(first: 20, topics: [ORDERS_CREATE]) { nodes { id endpoint { ... on WebhookHttpEndpoint { callbackUrl } } } } }"}') || fehler "Abo-Abfrage"

ABO_DA=$(printf '%s' "$VORHANDENE" | SITE="$SITE" python3 -c '
import json, os, sys
d = json.load(sys.stdin)
urls = [n["endpoint"].get("callbackUrl") for n in d["data"]["webhookSubscriptions"]["nodes"]]
print("ja" if os.environ["SITE"] + "/api/ticker/webhook" in urls else "nein")
')
if [ "$ABO_DA" = "ja" ]; then
  echo "Abo existiert schon (exakte URL) — übersprungen"
else
  ANTWORT=$(curl -sf "https://$STORE/admin/api/$API_VERSION/graphql.json" \
    -H @"$HDIR/tok" -H "Content-Type: application/json" \
    -d "{\"query\":\"mutation { webhookSubscriptionCreate(topic: ORDERS_CREATE, webhookSubscription: {callbackUrl: \\\"$SITE/api/ticker/webhook\\\", format: JSON}) { webhookSubscription { id } userErrors { message } } }\"}") || fehler "Abo-Anlage"
  printf '%s' "$ANTWORT" | grep -q '"userErrors":\[\]' || fehler "Abo-Anlage: $ANTWORT"
  echo "Abo angelegt: $ANTWORT"
fi

# ---------- 4. Verify ----------
schritt "4/4 Verifikation"
FINAL=$(curl -sf "https://$STORE/admin/api/$API_VERSION/graphql.json" \
  -H @"$HDIR/tok" -H "Content-Type: application/json" \
  -d '{"query":"{ webhookSubscriptions(first: 20, topics: [ORDERS_CREATE]) { nodes { endpoint { ... on WebhookHttpEndpoint { callbackUrl } } } } }"}' \
  | SITE="$SITE" python3 -c '
import json, os, sys
d = json.load(sys.stdin)
urls = [n["endpoint"].get("callbackUrl") for n in d["data"]["webhookSubscriptions"]["nodes"]]
print("ja" if os.environ["SITE"] + "/api/ticker/webhook" in urls else "nein")
')
[ "$FINAL" = "ja" ] || fehler "Abo nach Anlage nicht gefunden (exakte URL)"
echo "Abo verifiziert (exakte URL)."

cat <<'NACHSPIEL'

FERTIG. Der Beweis kommt mit dem nächsten echten Kauf: Preis sollte danach
in ~90 s springen (statt bis zu 10 min). Der 5-min-Cron bleibt Fallback —
fällt der Turbo je aus, wird alles nur wieder so schnell wie heute.
NACHSPIEL
