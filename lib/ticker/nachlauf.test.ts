import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TICKER_CONFIG as C } from "./config";
import { nachlaufNachKauf, planeNachlauf } from "./nachlauf";

/**
 * Der Kauf-Nachlauf ist die Naht zu ZWEI fremden Diensten (Ticket-System-Cron,
 * eigener Börsen-Tick) — und läuft nach der Webhook-Antwort ohne jemanden, der
 * wiederholen könnte. Deshalb hier jeder Ausgang einzeln: bestätigt, erst beim
 * zweiten Versuch bestätigt, nie bestätigt, Dienst tot, Secret fehlt.
 */
const PID = C.productGid.split("/").pop();
const LEDGER = `${C.nachlauf.ledgerUrl}?order=`;

let calls: { url: string; auth: string | null }[];
let ledgerAntworten: (() => Response | Promise<Response>)[];
let tickAntwort: () => Response | Promise<Response>;

const ok = (o: unknown) => new Response(JSON.stringify(o), { status: 200 });
const bestaetigt = (orderId: string) => () =>
  ok({ status: "ok", turboOrders: [`${PID}/${orderId}`], turboOrdersMitTicket: [`${PID}/${orderId}`], errors: [] });
const unbestaetigt = () => ok({ status: "degradiert", turboOrders: [], turboOrdersMitTicket: [], errors: ["Turbo-Order 7: nicht abrufbar"] });
/** Zahlung noch pending: Ticket-System hat einen GRABSTEIN geschrieben (turboOrders), aber kein gültiges Ticket. */
const grabstein = (orderId: string) => () =>
  ok({ status: "ok", turboOrders: [`${PID}/${orderId}`], turboOrdersMitTicket: [], errors: [] });

beforeEach(() => {
  vi.stubEnv("TICKETS_CRON_SECRET", "tickets-geheim");
  vi.stubEnv("CRON_SECRET", "cron-geheim");
  calls = [];
  ledgerAntworten = [];
  tickAntwort = () => ok({ status: "ok" });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      const auth = ((init?.headers ?? {}) as Record<string, string>)["Authorization"] ?? null;
      calls.push({ url: String(url), auth });
      if (String(url).startsWith(C.nachlauf.ledgerUrl)) {
        const next = ledgerAntworten.shift();
        if (!next) throw new Error("kein Ledger-Antwort-Skript mehr");
        return next();
      }
      if (String(url) === C.nachlauf.tickUrl) return tickAntwort();
      throw new Error(`unerwarteter Aufruf ${String(url)}`);
    })
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const schnell = { vorlaufMs: 0, wiederholungMs: 0 };

describe("nachlaufNachKauf", () => {
  it("Normalfall: Ledger bestätigt beim ersten Versuch → genau ein Ledger-Pass, dann der Tick — richtige Secrets, richtige Reihenfolge", async () => {
    ledgerAntworten = [bestaetigt("13155715219787")];
    const r = await nachlaufNachKauf("13155715219787", schnell);
    expect(r).toMatchObject({ ledger: "erledigt", ledgerVersuche: 1, tick: "ok" });
    expect(calls).toEqual([
      { url: `${LEDGER}13155715219787`, auth: "Bearer tickets-geheim" },
      { url: C.nachlauf.tickUrl, auth: "Bearer cron-geheim" },
    ]);
  });

  it("Bestell-ID wird URL-kodiert (Gürtel — die Route liefert ohnehin nur Ziffern)", async () => {
    ledgerAntworten = [unbestaetigt, unbestaetigt];
    await nachlaufNachKauf("a b", schnell);
    expect(calls[0].url).toBe(`${LEDGER}a%20b`);
  });

  it("Grabstein (Zahlung pending: in turboOrders, nicht in turboOrdersMitTicket) zählt NICHT als bestätigt → zweiter Versuch", async () => {
    // Codex-Review 02.09.: Das Ticket-System meldet auch eine PENDING-Bestellung als „erledigt"
    // (Grabstein mit 0 Tickets). Nur `turboOrdersMitTicket` ist die Bestätigung.
    ledgerAntworten = [grabstein("54"), bestaetigt("54")];
    const r = await nachlaufNachKauf("54", schnell);
    expect(r).toMatchObject({ ledger: "erledigt", ledgerVersuche: 2, tick: "ok" });
  });

  it("Antwort ohne turboOrdersMitTicket (altes Ticket-System) zählt als nicht bestätigt — kein Wurf", async () => {
    ledgerAntworten = [() => ok({ status: "ok", turboOrders: [`${PID}/53`] }), () => ok({ status: "ok" })];
    const r = await nachlaufNachKauf("53", schnell);
    expect(r).toMatchObject({ ledger: "nicht_bestaetigt", ledgerVersuche: 2, tick: "ok" });
  });

  it("erst beim zweiten Versuch bestätigt (Zahlung war noch pending) → zwei Ledger-Pässe, dann Tick", async () => {
    ledgerAntworten = [unbestaetigt, bestaetigt("55")];
    const r = await nachlaufNachKauf("55", schnell);
    expect(r).toMatchObject({ ledger: "erledigt", ledgerVersuche: 2, tick: "ok" });
    expect(calls.map((c) => c.url)).toEqual([`${LEDGER}55`, `${LEDGER}55`, C.nachlauf.tickUrl]);
  });

  it("nie bestätigt → nicht_bestaetigt nach genau zwei Versuchen, Tick läuft trotzdem (harmlos), kein Wurf", async () => {
    ledgerAntworten = [unbestaetigt, unbestaetigt];
    const r = await nachlaufNachKauf("56", schnell);
    expect(r).toMatchObject({ ledger: "nicht_bestaetigt", ledgerVersuche: 2, tick: "ok" });
    expect(calls).toHaveLength(3);
  });

  it("Ledger-Pass 500 bzw. Netzfehler → fehler, zweiter Versuch, Tick läuft, kein Wurf", async () => {
    ledgerAntworten = [
      () => new Response("kaputt", { status: 500 }),
      () => {
        throw new Error("ECONNRESET");
      },
    ];
    const r = await nachlaufNachKauf("57", schnell);
    expect(r).toMatchObject({ ledger: "fehler", ledgerVersuche: 2, tick: "ok" });
  });

  it("Tick scheitert (Netz/500) → tick: fehler, kein Wurf", async () => {
    ledgerAntworten = [bestaetigt("58")];
    tickAntwort = () => new Response("x", { status: 503 });
    expect((await nachlaufNachKauf("58", schnell)).tick).toBe("fehler");
    ledgerAntworten = [bestaetigt("58")];
    tickAntwort = () => {
      throw new Error("weg");
    };
    expect((await nachlaufNachKauf("58", schnell)).tick).toBe("fehler");
  });

  it("TICKETS_CRON_SECRET fehlt → Ledger übersprungen (kein Aufruf), Tick läuft", async () => {
    vi.stubEnv("TICKETS_CRON_SECRET", "");
    const r = await nachlaufNachKauf("59", schnell);
    expect(r).toMatchObject({ ledger: "uebersprungen", ledgerVersuche: 0, tick: "ok" });
    expect(calls.map((c) => c.url)).toEqual([C.nachlauf.tickUrl]);
  });

  it("CRON_SECRET fehlt → Tick übersprungen, Ledger läuft", async () => {
    vi.stubEnv("CRON_SECRET", "");
    ledgerAntworten = [bestaetigt("60")];
    const r = await nachlaufNachKauf("60", schnell);
    expect(r).toMatchObject({ ledger: "erledigt", tick: "uebersprungen" });
    expect(calls.map((c) => c.url)).toEqual([`${LEDGER}60`]);
  });

  it("Wartezeiten kommen aus der Config und werden eingehalten (Vorlauf vor dem ersten, Wiederholung vor dem zweiten Pass)", async () => {
    vi.useFakeTimers();
    try {
      ledgerAntworten = [unbestaetigt, bestaetigt("61")];
      const lauf = nachlaufNachKauf("61"); // Config-Defaults
      await vi.advanceTimersByTimeAsync(C.nachlauf.vorlaufMs - 1);
      expect(calls).toHaveLength(0); // noch im Vorlauf
      await vi.advanceTimersByTimeAsync(1);
      expect(calls).toHaveLength(1); // erster Ledger-Pass
      await vi.advanceTimersByTimeAsync(C.nachlauf.wiederholungMs - 1);
      expect(calls).toHaveLength(1); // noch in der Wiederholungs-Pause
      await vi.advanceTimersByTimeAsync(1);
      expect(calls).toHaveLength(3); // zweiter Pass + Tick (beide sofort)
      expect((await lauf).ledger).toBe("erledigt");
    } finally {
      vi.useRealTimers();
    }
  });

  it("Worst Case aller Wartezeiten und Timeouts bleibt unter maxDuration (60 s) der Webhook-Route", () => {
    const n = C.nachlauf;
    const worst = n.vorlaufMs + n.ledgerTimeoutMs + n.wiederholungMs + n.ledgerTimeoutMs + n.tickTimeoutMs;
    expect(worst).toBeLessThan(55_000);
  });
});

describe("planeNachlauf", () => {
  it("Preview-Deploy (VERCEL_ENV=preview) plant NICHT — die Ziele sind Produktions-Endpunkte", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(planeNachlauf("1")).toBe("nicht_geplant");
  });

  it("ohne Request-Kontext (after() wirft) → nicht_geplant statt Wurf; lokal (VERCEL_ENV leer) wird versucht", () => {
    vi.stubEnv("VERCEL_ENV", "");
    expect(planeNachlauf("1")).toBe("nicht_geplant"); // kein Next-Request-Kontext im Unit-Test
  });
});
