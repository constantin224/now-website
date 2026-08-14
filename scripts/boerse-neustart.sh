#!/bin/bash
# Ticket-Börse — Neustart auf 22,00 € (Baseline + Uhr frisch).
# Ausführen: cd ~/claude-projects/now-website && ./scripts/boerse-neustart.sh
#
# Warum so: Der Preis wird NIE gespeichert, sondern abgeleitet
# (Startpreis − 1 € je Verkauf + 1 €/Tag seit startAtIso). „Zurück auf 22 €"
# heißt deshalb: Börse neu aufsetzen — Metafield ticker.state löschen und
# SOFORT ?start=1. Der Start friert die aktuell gültigen Tickets als neue
# Baseline ein und setzt startAtIso = jetzt → Preis exakt 22,00 €.
# Die bisherige Chart-Historie beginnt dabei neu (bewusst).
#
# Race-Betrachtung: Ein nackter QStash-Tick zwischen Löschen und Start ist
# harmlos (not_started, schreibt nichts); der Start-Write ist per CAS
# (compareDigest: null → Conflict bei zwischenzeitlich angelegtem Metafield)
# geschützt. TICKER_ENABLED bleibt an — die Not-Aus-Reihenfolge aus dem
# Handoff gilt nur fürs ENDGÜLTIGE Abschalten.
set -euo pipefail
cd "$(dirname "$0")/.."

STORE="03e6c1.myshopify.com"
API="2026-04"
SITE="https://now-music.at"
TICKETS="https://tickets.tonherd.com"
WIEN_PID="15354134921547"
PRODUCT_GID="gid://shopify/Product/15354134921547"
VARIANT_GID="gid://shopify/ProductVariant/55861172863307"
CLIENT_ID="aec9c6c4f780fd9d0a082bd97e501392"

schritt() { printf '\n\033[1m== %s ==\033[0m\n' "$1"; }
fehler()  { printf '\n\033[31mABBRUCH: %s\033[0m\n' "$1"; exit 1; }

# Secrets als Header-Dateien in 700er-Tempverzeichnis (nie auf der
# curl-Kommandozeile — Prozessliste). Trap räumt auch bei Abbruch auf.
HDIR=$(mktemp -d) && chmod 700 "$HDIR"
trap 'rm -rf "$HDIR"' EXIT

# ---------- 0. Preflight ----------
schritt "0/5 Preflight: Secrets"
SCS=$(security find-generic-password -s tonherd-shopify-client-secret -w) || fehler "Keychain tonherd-shopify-client-secret fehlt"
TMS=$(security find-generic-password -s tonherd-tickets-monitor-secret -w) || fehler "Keychain tonherd-tickets-monitor-secret fehlt"
MON=$(security find-generic-password -s now-boerse-monitor-secret -w) || fehler "Keychain now-boerse-monitor-secret fehlt"
printf 'x-monitor-secret: %s\n' "$TMS" > "$HDIR/tms"
printf 'x-monitor-secret: %s\n' "$MON" > "$HDIR/mon"

vercel env pull "$HDIR/envs" --environment=production --yes >/dev/null 2>&1 || fehler "vercel env pull (Projekt gelinkt? CLI eingeloggt?)"
CRON=$( (grep '^CRON_SECRET=' "$HDIR/envs" || true) | cut -d= -f2- | sed -E 's/^"//; s/"$//; s/\\n$//')
[ -n "$CRON" ] || fehler "CRON_SECRET nicht in Vercel gefunden"
printf 'Authorization: Bearer %s\n' "$CRON" > "$HDIR/cron"

SFT=$( (grep '^NEXT_PUBLIC_SHOPIFY_STOREFRONT_TOKEN=' .env.local || true) | cut -d= -f2- | sed -E 's/^"//; s/"$//; s/\\n$//')
[ -n "$SFT" ] || fehler "Storefront-Token nicht in .env.local (vercel env pull .env.local --environment=production)"
printf 'X-Shopify-Storefront-Access-Token: %s\n' "$SFT" > "$HDIR/sft"

# Admin-Token (client_credentials — wie lib/ticker/shopify-admin.ts)
TOK=$(curl -sf --max-time 10 "https://$STORE/admin/oauth/access_token" \
  -H "Content-Type: application/json" \
  -d "{\"grant_type\":\"client_credentials\",\"client_id\":\"$CLIENT_ID\",\"client_secret\":\"$SCS\"}" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])') || fehler "Admin-Token nicht bekommen"
printf 'X-Shopify-Access-Token: %s\n' "$TOK" > "$HDIR/adm"

gql() { # $1 = JSON-Body
  curl -sf --max-time 15 "https://$STORE/admin/api/$API/graphql.json" \
    -H @"$HDIR/adm" -H "Content-Type: application/json" -d "$1"
}

# ---------- 1. Ticket-System muss antworten (sonst würde ?start=1 verweigern
# und die Börse stünde ohne Zustand da) ----------
schritt "1/5 Ticket-System: Verkaufszahl scharf?"
VZ=$(curl -sf -H @"$HDIR/tms" "$TICKETS/api/verkaufszahl?pid=$WIEN_PID") || fehler "verkaufszahl nicht erreichbar — NICHTS gelöscht"
echo "$VZ"
echo "$VZ" | grep -q '"scharf":true' || fehler "Event nicht scharf — NICHTS gelöscht (erst Ticket-System prüfen)"

# ---------- 2. Alten Zustand festhalten (fürs Protokoll) ----------
schritt "2/5 Alter Zustand (ticker.state) + alter Shop-Preis"
ALT=$(gql "{\"query\":\"{ product(id: \\\"$PRODUCT_GID\\\") { metafield(namespace: \\\"ticker\\\", key: \\\"state\\\") { value } } }\"}") || fehler "Zustand nicht lesbar"
echo "$ALT"
echo "$ALT" | grep -q '"value"' || fehler "Kein ticker.state-Metafield gefunden — Börse läuft gar nicht? Nichts zu löschen."
PREIS_ALT=$(curl -sf "https://$STORE/api/2024-10/graphql.json" -H @"$HDIR/sft" -H "Content-Type: application/json" \
  -d "{\"query\":\"{ node(id: \\\"$VARIANT_GID\\\") { ... on ProductVariant { price { amount } } } }\"}") || true
echo "Shop-Preis vorher: $PREIS_ALT"

# ---------- 3. Metafield löschen ----------
schritt "3/5 Metafield ticker.state löschen"
DEL=$(gql "{\"query\":\"mutation { metafieldsDelete(metafields: [{ ownerId: \\\"$PRODUCT_GID\\\", namespace: \\\"ticker\\\", key: \\\"state\\\" }]) { deletedMetafields { key } userErrors { field message } } }\"}") || fehler "metafieldsDelete fehlgeschlagen"
echo "$DEL"
echo "$DEL" | grep -q '"userErrors":\[\]' || fehler "metafieldsDelete meldet Fehler — Antwort oben lesen; JETZT ZÜGIG KLÄREN (Zustand evtl. weg, Börse noch nicht neu gestartet)"

# ---------- 4. Sofort neu starten ----------
schritt "4/5 Neustart (?start=1) — friert Baseline neu ein, Uhr auf jetzt"
START=$(curl -s -H @"$HDIR/cron" "$SITE/api/ticker/tick?start=1" || true)
echo "$START"
case "$START" in
  *'"status":"started"'*) echo "BÖRSE NEU GESTARTET." ;;
  *) fehler "Start NICHT gelungen — Metafield ist bereits GELÖSCHT, Börse steht! Sofort nochmal: curl -H 'Authorization: Bearer <CRON_SECRET>' '$SITE/api/ticker/tick?start=1' (503 start_verweigert = Ticket-System lieferte keine Zahl)" ;;
esac

# ---------- 5. Beweise ----------
schritt "5/5 Verifikation"
ST=$(curl -s -o /dev/null -w "%{http_code}" -H @"$HDIR/mon" "$SITE/api/ticker/status" || echo 000)
[ "$ST" = "200" ] || fehler "Betriebsampel meldet $ST statt 200 — /api/ticker/status ansehen"
echo "Betriebsampel: 200 (gut)"
PREIS=$(curl -sf "https://$STORE/api/2024-10/graphql.json" -H @"$HDIR/sft" -H "Content-Type: application/json" \
  -d "{\"query\":\"{ node(id: \\\"$VARIANT_GID\\\") { ... on ProductVariant { price { amount } } } }\"}") || fehler "Shopify-Preisabfrage fehlgeschlagen"
echo "Shop-Preis jetzt: $PREIS"
echo "$PREIS" | grep -q '"amount":"22.0' || fehler "Preis ist NICHT 22 — Antwort oben lesen"

printf '\n\033[1mFERTIG — Kurs steht wieder bei 22,00 €, Uhr läuft ab jetzt.\033[0m\n'
echo "Seite: $SITE/de/tickets (Chart beginnt neu; +1 €/Tag ab jetzt, −1 € je Verkauf)"
