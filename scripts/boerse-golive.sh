#!/bin/bash
# Ticket-Börse — Go-Live in einem Lauf.
# Ausführen: cd ~/claude-projects/now-website && ./scripts/boerse-golive.sh
#
# Reihenfolge = Handoff §Go-Live (docs/TICKET-BOERSE-HANDOFF.md), automatisiert.
# Bricht bei jedem Fehler sofort ab; jeder Schritt meldet sich im Klartext.
# Wiederanlauf ist sicher: Envs werden nur ergänzt, das QStash-Schedule wird
# nicht doppelt angelegt, Re-Arm ist ein normaler Vorgang, und ?start=1 auf
# eine laufende Börse antwortet mit status "ok" statt neu zu starten.
set -euo pipefail
cd "$(dirname "$0")/.."
GESAMT_START=$SECONDS

WIEN_PID="15354134921547"
TICKETS="https://tickets.tonherd.com"
SITE="https://now-music.at"
QSTASH_BASE="https://qstash-eu-central-1.upstash.io/v2/schedules"

schritt() { printf '\n\033[1m== %s ==\033[0m\n' "$1"; }
fehler()  { printf '\n\033[31mABBRUCH: %s\033[0m\n' "$1"; exit 1; }

# Secrets landen als Header-Dateien in einem 700er-Tempverzeichnis statt auf
# der curl-Kommandozeile — sonst stünden sie während jedes Requests in der
# Prozessliste. Trap räumt auch bei Abbruch auf.
HDIR=$(mktemp -d) && chmod 700 "$HDIR"
trap 'rm -rf "$HDIR"' EXIT

# ---------- 0. Preflight ----------
schritt "0/9 Preflight: Secrets + Ticket-System-Ampel"
MON=$(security find-generic-password -s now-boerse-monitor-secret -w) || fehler "Keychain now-boerse-monitor-secret fehlt"
TMS=$(security find-generic-password -s tonherd-tickets-monitor-secret -w) || fehler "Keychain tonherd-tickets-monitor-secret fehlt"
SCS=$(security find-generic-password -s tonherd-shopify-client-secret -w) || fehler "Keychain tonherd-shopify-client-secret fehlt"
ADM=$(security find-generic-password -s tonherd-tickets-admin-secret -w) || fehler "Keychain tonherd-tickets-admin-secret fehlt"
QTK=$(security find-generic-password -a qstash -s tonherd-tickets-qstash-token -w) || fehler "Keychain tonherd-tickets-qstash-token fehlt"

printf 'x-monitor-secret: %s\n'  "$TMS" > "$HDIR/tms"
printf 'x-monitor-secret: %s\n'  "$MON" > "$HDIR/mon"
printf 'x-admin-secret: %s\n'    "$ADM" > "$HDIR/adm"
printf 'Authorization: Bearer %s\n' "$QTK" > "$HDIR/qtk"

AMPEL=$(curl -sf -o /dev/null -w "%{http_code}" -H @"$HDIR/tms" "$TICKETS/api/status") \
  || fehler "Ticket-System-Ampel nicht erreichbar"
[ "$AMPEL" = "200" ] || fehler "Ticket-System-Ampel meldet $AMPEL (nicht GRÜN) — erst dort nachsehen"
echo "Ticket-System: GRÜN"

# ---------- 1. Vercel-Envs: alle sechs müssen stehen ----------
schritt "1/9 Vercel-Envs prüfen/ergänzen (alle 6 Pflicht-Variablen)"
VORHANDEN=$(vercel env ls production 2>/dev/null) || fehler "vercel env ls (Projekt gelinkt? vercel CLI eingeloggt?)"
env_setzen() {
  local name="$1" wert="$2"
  if echo "$VORHANDEN" | grep -q " $name "; then echo "$name: schon da"; else
    printf '%s' "$wert" | vercel env add "$name" production >/dev/null 2>&1 || fehler "env add $name"
    echo "$name: gesetzt"
  fi
}
env_setzen TICKER_ENABLED "1"
# Ab dem Go-Live ist "disabled" ein Alarm (503 der Ampel), kein Ruhezustand:
# Eine versehentlich verlorene TICKER_ENABLED-Env bliebe sonst lautlos.
env_setzen TICKER_EXPECTED_RUNNING "1"
env_setzen TICKETS_BASE_URL "$TICKETS"
env_setzen SHOPIFY_ADMIN_CLIENT_ID "aec9c6c4f780fd9d0a082bd97e501392"
env_setzen MONITOR_SECRET "$MON"
env_setzen TICKETS_MONITOR_SECRET "$TMS"
env_setzen SHOPIFY_ADMIN_CLIENT_SECRET "$SCS"

# CRON_SECRET für die Aufrufe unten aus Vercel holen (steht dort seit jeher)
vercel env pull "$HDIR/envs" --environment=production --yes >/dev/null 2>&1 || fehler "vercel env pull"
CRON=$( (grep '^CRON_SECRET=' "$HDIR/envs" || true) | cut -d= -f2- | sed -E 's/^"//; s/"$//; s/\\n$//')
[ -n "$CRON" ] || fehler "CRON_SECRET nicht in Vercel gefunden"
printf 'Authorization: Bearer %s\n' "$CRON" > "$HDIR/cron"

# WERTE prüfen, nicht nur Existenz: env_setzen überspringt vorhandene Variablen —
# eine schon vorhandene TICKER_ENABLED=0 oder leere TICKER_EXPECTED_RUNNING
# bliebe sonst still stehen und der ganze Go-Live liefe ins Leere.
for PFLICHT in TICKER_ENABLED TICKER_EXPECTED_RUNNING; do
  WERT=$( (grep "^$PFLICHT=" "$HDIR/envs" || true) | cut -d= -f2- | sed -E 's/^"//; s/"$//; s/\\n$//')
  [ "$WERT" = "1" ] || fehler "$PFLICHT ist '$WERT' statt '1' — in Vercel korrigieren (vercel env rm $PFLICHT production && neu setzen), dann Script neu starten"
done

# Storefront-Token für den Preis-Beweis am Ende (nur Quotes + literales \n strippen)
SFT=$( (grep '^NEXT_PUBLIC_SHOPIFY_STOREFRONT_TOKEN=' .env.local || true) | cut -d= -f2- | sed -E 's/^"//; s/"$//; s/\\n$//')
[ -n "$SFT" ] || fehler "Storefront-Token nicht in .env.local"
printf 'X-Shopify-Storefront-Access-Token: %s\n' "$SFT" > "$HDIR/sft"

# ---------- 2. Deploy ----------
schritt "2/9 Deploy (vercel --prod)"
T0=$SECONDS
vercel --prod 2>&1 | tail -3 || fehler "Deploy fehlgeschlagen — Fallback: rm -rf .next && npm run build, dann vercel --prod --prebuilt"
echo "Deploy-Dauer: $((SECONDS-T0)) s"

# ---------- 3. Seite live? ----------
schritt "3/9 Warten bis $SITE/de/tickets antwortet"
CODE=000
for i in $(seq 1 12); do
  if ! CODE=$(curl -s -o /dev/null -w "%{http_code}" "$SITE/de/tickets"); then CODE=000; fi
  [ "$CODE" = "200" ] && break
  echo "Versuch $i: $CODE — warte 10 s"
  sleep 10
done
[ "$CODE" = "200" ] || fehler "/de/tickets liefert $CODE statt 200"
echo "Seite live (200) — zeigt bis zum Start den nüchternen Fallback"

# ---------- 4. Tick erreichbar + eingeschaltet ----------
schritt "4/9 Tick-Endpunkt prüfen"
TICK=$(curl -sf -H @"$HDIR/cron" "$SITE/api/ticker/tick") || fehler "Tick nicht erreichbar/401"
case "$TICK" in
  *'"status":"disabled"'*) fehler "TICKER_ENABLED wirkt nicht (disabled) — Env prüfen, neu deployen" ;;
  *'"status":"not_started"'*) echo "Tick bereit (not_started)" ;;
  *'"status":"ok"'*) echo "Börse läuft bereits (ok) — Wiederanlauf" ;;
  *) fehler "Unerwartete Tick-Antwort: $TICK" ;;
esac

# ---------- 5. Wien scharfschalten ----------
schritt "5/9 Wien 17.10. armen (pid $WIEN_PID)"
ARM=$(curl -sf -X POST -H @"$HDIR/adm" -H "content-type: application/json" \
  -d "{\"productId\":\"$WIEN_PID\"}" "$TICKETS/api/arm") || fehler "Arming fehlgeschlagen"
echo "Arm-Antwort: $ARM"

# ---------- 6. Verkaufszahl da? ----------
schritt "6/9 Verkaufszahl aus dem Ticket-System"
VZ=$(curl -sf -H @"$HDIR/tms" "$TICKETS/api/verkaufszahl?pid=$WIEN_PID") || fehler "verkaufszahl nicht erreichbar"
echo "$VZ"
echo "$VZ" | grep -q '"scharf":true' || fehler "Event nicht scharf — Börse darf so nicht starten"

# ---------- 7. QStash-Schedule (alle 5 min) ----------
schritt "7/9 QStash-Schedule für den Tick"
LISTE=$(curl -sf -H @"$HDIR/qtk" "$QSTASH_BASE") || fehler "QStash-Schedule-Liste nicht abrufbar"
# Nicht nur die URL prüfen: ein vorhandenes Schedule mit falscher Methode oder
# falschem Takt würde sonst still übernommen. Bei Abweichung: Abbruch, Mensch entscheidet.
BEFUND=$(printf '%s' "$LISTE" | CRON="$CRON" python3 -c '
import json, os, sys
ZIEL = "https://now-music.at/api/ticker/tick"
for s in json.load(sys.stdin):
    if s.get("destination", "").rstrip("/") == ZIEL:
        ok = s.get("method") == "GET" and s.get("cron") == "*/5 * * * *"
        if not ok:
            print("kaputt method=%s cron=%s" % (s.get("method"), s.get("cron"))); break
        # Auch das weitergereichte Bearer-Secret pruefen: Ein Schedule mit
        # ALTEM CRON_SECRET saehe sonst korrekt aus, liefe aber nur 401er.
        # Erst das strukturierte Header-Feld (QStash: header -> Liste),
        # zur Sicherheit danach der serialisierte Rest. Nicht auffindbar =
        # nur Hinweis; der verbindliche Beweis ist der lastTickAt-Fortschritt
        # im Nachspiel.
        cron = os.environ["CRON"]
        soll = "Bearer " + cron
        hdr = s.get("header") or {}
        auth = None
        for k, v in hdr.items():
            if k.lower() in ("authorization", "upstash-forward-authorization"):
                auth = v[0] if isinstance(v, list) and v else v
        if auth is not None:
            print("ok" if auth == soll else "kaputt forward-auth (altes CRON_SECRET?)")
        elif cron in json.dumps(s):
            print("ok")
        else:
            print("ok-ohne-header-pruefung")
        break
else:
    print("fehlt")
')
case "$BEFUND" in
  ok)     echo "Schedule existiert korrekt (inkl. Forward-Auth) — übersprungen" ;;
  ok-ohne-header-pruefung)
          echo "Schedule existiert (Methode+Takt ok); Forward-Auth war in der API-Antwort nicht prüfbar — falls die Ampel in ~30 min rot wird: Schedule in QStash löschen und Script neu starten" ;;
  fehlt)  BEFUND="anlegen" ;;
  *)      fehler "Vorhandenes Tick-Schedule passt nicht ($BEFUND) — in QStash ansehen/löschen, dann Script neu starten" ;;
esac
if [ "$BEFUND" = "anlegen" ]; then
  SCHED=$(curl -sf -X POST "$QSTASH_BASE/$SITE/api/ticker/tick" \
    -H @"$HDIR/qtk" \
    -H "Upstash-Cron: */5 * * * *" \
    -H "Upstash-Method: GET" \
    -H "Upstash-Retries: 1" \
    -H "Upstash-Forward-Authorization: Bearer $CRON") || fehler "Schedule-Anlage fehlgeschlagen"
  echo "Schedule angelegt: $SCHED"
fi

# ---------- 8. Börse starten ----------
schritt "8/9 START (?start=1) — friert Alt-Käufer als Baseline ein"
START=$(curl -s -H @"$HDIR/cron" "$SITE/api/ticker/tick?start=1" || true)
echo "$START"
case "$START" in
  *'"status":"started"'*) echo "BÖRSE GESTARTET." ;;
  *'"status":"ok"'*)      echo "Börse lief schon — Tick normal durchgelaufen." ;;
  *) fehler "Start NICHT gelungen — Antwort oben lesen (start_verweigert 503 = Ticket-System lieferte keine Zahl)" ;;
esac

# ---------- 9. Beweise ----------
schritt "9/9 Verifikation"
ST=$(curl -s -o /dev/null -w "%{http_code}" -H @"$HDIR/mon" "$SITE/api/ticker/status" || echo 000)
[ "$ST" = "200" ] || fehler "Betriebsampel meldet $ST statt 200 — /api/ticker/status ansehen"
echo "Betriebsampel: 200 (gut)"
PREIS=$(curl -sf "https://03e6c1.myshopify.com/api/2024-10/graphql.json" \
  -H @"$HDIR/sft" -H "Content-Type: application/json" \
  -d '{"query":"{ node(id: \"gid://shopify/ProductVariant/55861172863307\") { ... on ProductVariant { price { amount } } } }"}') \
  || fehler "Shopify-Preisabfrage fehlgeschlagen"
printf '%s' "$PREIS" | grep -q '"amount"' || fehler "Shopify-Antwort ohne Preis: $PREIS"
echo "Shopify-Preis jetzt: $PREIS"

printf '\n\033[1mFERTIG in %s s.\033[0m\n' "$((SECONDS-GESAMT_START))"
cat <<'NACHSPIEL'

Noch 2 Handgriffe (einmalig):
1. Apps-Script-Wächter: script.google.com (Konto info@tonherd.com) → Projekt
   "Tonherd Tickets Waechter" → Projekteinstellungen → Skript-Eigenschaften →
   BOERSE_MONITOR_SECRET = Wert aus:  security find-generic-password -s now-boerse-monitor-secret -w
   Danach einmal die Funktion "pruefe" ausführen (sollte still bleiben = gesund).
2. Seite anschauen: https://now-music.at/de/tickets — Hero zeigt jetzt den Kurs (22,00 €).
   Ab jetzt tickt die Börse alle 5 min — Community-Pricing: −1 € je verkauftem
   Ticket, +1 €/Tag kontinuierlich, Boden 8 €, Deckel 30 €.
3. In ~10 min prüfen, ob QStash WIRKLICH tickt (der Start oben kam von Hand,
   und die Ampel alarmiert erst nach 30 min Stillstand — ein bloßes 200 nach
   10 min beweist also nichts). Beweis ist der lastTickAt-Fortschritt:
   curl -s -H "x-monitor-secret: $(security find-generic-password -s now-boerse-monitor-secret -w)" https://now-music.at/api/ticker/status | grep -o '"lastTickAt":"[^"]*"'
   → Der Zeitstempel (UTC!) muss JÜNGER sein als der Go-Live-Moment eben.
   Steht er fest, tickt QStash nicht: Schedule in QStash ansehen/löschen,
   Script neu starten. (Ab 30 min Stillstand mailt ohnehin der Wächter.)

Not-Aus (Reihenfolge zwingend): TICKER_ENABLED=0 in Vercel → Metafield ticker.state
löschen → erst dann Preis zurücksetzen. Details: docs/TICKET-BOERSE-HANDOFF.md.
NACHSPIEL
