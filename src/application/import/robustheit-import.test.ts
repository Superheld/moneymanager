// Robustheits-Tests der Import-Pipeline + Migrationskette (Angriffs-Session „test/robustheit").
//
// Ziel dieser Datei ist NICHT, bestehendes Verhalten zu bestätigen, sondern Bruchstellen zu
// belegen. Tests, die einen echten Fund zeigen, sind ROT und tragen einen Kommentarblock:
//   ERWARTET / TATSÄCHLICH / WARUM FALSCH.
// Grüne Tests am Ende dokumentieren die Stellen, die dem Angriff standgehalten haben.
//
// Kein Produktivcode wurde geändert. Persistenz-Tests laufen gegen In-Memory-sql.js,
// nie gegen die echte Nutzer-DB.

import { beforeAll, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";
import { finanzguruAdapter } from "../../adapters/import/finanzguruAdapter";
import { xlsxAusZeilen } from "../../test/xlsxBauen";
import { migrate, type MigrationsDb } from "../../adapters/persistence/db";
import { MIGRATIONS } from "../../adapters/persistence/migrations";
import type { Kategorie, Zahlungskonto } from "../../core";
import { tageBis } from "../../core";
import type { ImportLauf } from "./importLauf";
import { kontoMatchVorschlag } from "./kontoMatch";
import { klassifiziere, rohHash } from "./rohHash";
import type { RohUmsatz } from "./rohUmsatz";
import type { Umsatz } from "./umsatz";
import { umsaetzeUebernehmen, type UebernahmeDeps, type UebernahmeEingabe } from "./umsaetzeUebernehmen";
import { paareUmbuchungen } from "./umsatzVerbuchen";

// ── Testdaten-Werkzeug ────────────────────────────────────────────────────────────

/** Echte Kopfzeile des Finanzguru-Exports (Spaltenzahl/-reihenfolge wie in der Datei). */
const KOPF = [
  "Buchungstag", "Referenzkonto", "Name Referenzkonto", "Betrag", "Kontostand", "Waehrung",
  "Beguenstigter/Auftraggeber", "IBAN Beguenstigter/Auftraggeber", "Verwendungszweck", "E-Ref",
  "Mandatsreferenz", "Glaeubiger-ID", "Analyse-Hauptkategorie", "Analyse-Unterkategorie",
  "Analyse-Vertrag", "Analyse-Vertragsturnus", "Analyse-Vertrags-ID", "Analyse-Umbuchung",
  "Analyse-Vom frei verfuegbaren Einkommen ausgeschlossen", "Analyse-Umsatzart", "Analyse-Betrag",
  "Analyse-Woche", "Analyse-Monat", "Analyse-Quartal", "Analyse-Jahr", "Buchungs-ID",
  "Referenz-Original-ID", "Split-Typ",
];

/** Excel-Seriennummer des 01.11.2021 — der Tag, an dem die Testdaten hängen. */
const T_2021_11_01 = "44501";

function reihe(o: {
  tag?: string; konto?: string; betrag?: string; gegenpartei?: string; zweck?: string;
  unterkat?: string; umbuchung?: string; buchungsId?: string;
}): string[] {
  const f = (s = "") => s;
  return [
    f(o.tag), f(o.konto), "Girokonto", f(o.betrag), "63.09", "EUR",
    f(o.gegenpartei), "", f(o.zweck), "", "", "",
    "Essen & Trinken", f(o.unterkat), "nein", "", "", f(o.umbuchung ?? "nein"), "nein", "Kartenzahlung",
    "Ausgaben", "2021-45", "2021-11", "2021-Q4", "2021", f(o.buchungsId), "", "",
  ];
}

function csv(...reihen: string[][]): Uint8Array {
  return xlsxAusZeilen([KOPF, ...reihen]);
}

function roh(over: Partial<RohUmsatz> = {}): RohUmsatz {
  return {
    buchungstag: "2026-01-05", betrag: -500, waehrung: "EUR", gegenpartei: "x",
    verwendungszweck: "", istUmbuchung: false, quelle: "bank-csv",
    kontoIban: "DE89370400440532013000", ...over,
  };
}

function umsatz(id: string, betrag: number, kontoId: string, tag = "2026-01-05"): Umsatz {
  return {
    id, laufId: "l1", zahlungskontoId: kontoId, buchungstag: tag, betrag,
    waehrung: "EUR", gegenpartei: "", verwendungszweck: "", rohHash: id, status: "neu",
    vorschlag: { charakter: "Umschichtung", quelle: "umbuchung" },
  };
}

/** In-Memory-Repos für die Use-Case-Tests (kein IO, keine echte DB). */
function fakes() {
  const umsaetze: Umsatz[] = [];
  const konten: Zahlungskonto[] = [];
  const laeufe: ImportLauf[] = [];
  let n = 0;
  const deps: UebernahmeDeps = {
    kontoRepo: {
      alle: async () => konten,
      speichern: async (k: Zahlungskonto) => { konten.push(k); },
      loeschen: async () => {},
    } as UebernahmeDeps["kontoRepo"],
    kategorieRepo: {
      alle: async (): Promise<Kategorie[]> => [],
      speichern: async () => {},
      loeschen: async () => {},
    } as unknown as UebernahmeDeps["kategorieRepo"],
    umsatzRepo: {
      speichern: async (u: Umsatz) => { umsaetze.push(u); },
      speichernViele: async (us: readonly Umsatz[]) => { umsaetze.push(...us); },
      alle: async () => umsaetze,
      nachLauf: async () => [],
      offene: async () => umsaetze,
      loeschen: async () => {},
      bestandsSchluessel: async () => ({
        hashes: umsaetze.map((u) => u.rohHash),
        nativeIds: umsaetze.flatMap((u) => (u.nativeId ? [u.nativeId] : [])),
      }),
    } as UebernahmeDeps["umsatzRepo"],
    laufRepo: {
      alle: async () => laeufe,
      speichern: async (l: ImportLauf) => { laeufe.push(l); },
      loeschen: async () => {},
    } as UebernahmeDeps["laufRepo"],
    id: () => `id-${++n}`,
  };
  return { deps, umsaetze, konten, laeufe };
}

const require = createRequire(import.meta.url);
let SQL: SqlJsStatic;
beforeAll(async () => {
  SQL = await initSqlJs({ locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm") });
});

function frischeDb(): Database {
  const db = new SQL.Database();
  for (const m of MIGRATIONS) for (const sql of m.sql) db.run(sql);
  return db;
}

/**
 * Adapter sql.js → MigrationsDb, damit `migrate` aus db.ts unter Test läuft (in der App
 * hängt dort tauri-plugin-sql). `sabotage` lässt ein bestimmtes Statement scheitern und
 * simuliert so einen Abbruch mitten in einer Migration.
 */
function migrationsDb(db: Database, sabotage?: (sql: string) => boolean): MigrationsDb {
  return {
    async execute(sql: string, werte?: unknown[]) {
      if (sabotage?.(sql)) throw new Error("simulierter Abbruch");
      db.run(sql, werte as never);
    },
    async select<T>(sql: string): Promise<T> {
      const [res] = db.exec(sql);
      if (!res) return [] as unknown as T;
      return res.values.map((zeile) =>
        Object.fromEntries(res.columns.map((c, i) => [c, zeile[i]])),
      ) as unknown as T;
    },
  };
}

/** Aktueller Schemastand laut _migration. */
function version(db: Database): number {
  const [res] = db.exec("SELECT COALESCE(MAX(version), 0) AS v FROM _migration");
  return Number(res?.values[0]?.[0] ?? 0);
}

// ══ 1. Datei-Struktur: stiller Datenverlust ════════════════════════════════════════

describe("Finanzguru-Adapter — beschädigte Datei", () => {
  /**
   * Erbe der beiden CSV-Quoting-Tests, die hier standen (FUND 1: ein unterminiertes
   * Anführungszeichen fraß den Rest der Datei, ohne dass eine Warnung entstand).
   *
   * Mit dem Wechsel auf xlsx (2026-08-16) gibt es kein Quoting mehr — die Fundstelle ist
   * verschwunden, die GEFAHR nicht: eine strukturell kaputte Datei darf nicht als „0
   * Umsätze, 0 Warnungen" durchgehen. Genau das prüft dieser Test an der neuen Struktur.
   */
  it("meldet eine unlesbare Datei, statt still nichts zu liefern", () => {
    const abgeschnitten = csv(reihe({ tag: T_2021_11_01, betrag: "-1.00", gegenpartei: "A" })).slice(0, 40);
    const erg = finanzguruAdapter.lies(abgeschnitten);
    expect(erg.umsaetze).toHaveLength(0);
    expect(erg.warnungen.length).toBeGreaterThan(0);
  });

  it("liest eine intakte Datei vollständig", () => {
    const erg = finanzguruAdapter.lies(
      csv(
        reihe({ tag: T_2021_11_01, betrag: "-1.00", gegenpartei: "A" }),
        reihe({ tag: T_2021_11_01, betrag: "-2.00", gegenpartei: "B" }),
        reihe({ tag: T_2021_11_01, betrag: "-3.00", gegenpartei: "C" }),
      ),
    );
    expect(erg.umsaetze).toHaveLength(3);
    expect(erg.warnungen).toHaveLength(0);
  });
});

describe("Finanzguru-Adapter — Kopfzeilen-Suche", () => {
  /**
   * ROT — FUND 14 (niedrig): die Kopfzeile wird nur gefunden, wenn „Buchungstag" die ERSTE
   *   Spalte ist.
   * ERWARTET: Der Adapter mappt überall über Spaltennamen (finanzguruAdapter.ts:22-36), ist
   *   also spaltenreihenfolge-unabhängig — eine Datei mit umsortierten Spalten muss lesbar sein.
   * TATSÄCHLICH: finanzguruAdapter.ts:58 sucht `z.startsWith("Buchungstag;")`. Steht Betrag
   *   vorn, wird die Kopfzeile nicht gefunden, die Müllzeile „Tabelle 1" wird zur Kopfzeile
   *   und JEDE Zeile scheitert am Datum → 0 Umsätze.
   * WARUM FALSCH: `erkennt()` sagt trotzdem „ja, Finanzguru" (Zeile 90-93, sucht „buchungstag;"
   *   irgendwo). Der Nutzer bekommt für eine gültige Datei „0 Umsätze" plus n-mal „ungültiges
   *   Datum „"" — eine Fehlermeldung, die auf die falsche Ursache zeigt. Löst heute niemand
   *   aus (FG liefert Buchungstag zuerst), bricht aber bei der nächsten Formatänderung.
   */
  it("liest eine Datei mit umsortierten Spalten", () => {
    const vertauscht = xlsxAusZeilen([
      ["Betrag", "Buchungstag", "Analyse-Hauptkategorie", "Analyse-Unterkategorie"],
      ["-6.55", T_2021_11_01, "Essen", "Lebensmittel"],
    ]);
    expect(finanzguruAdapter.erkennt(vertauscht)).toBe(true);
    expect(finanzguruAdapter.lies(vertauscht).umsaetze).toHaveLength(1);
  });
});

describe("Finanzguru-Adapter — Datumsprüfung", () => {
  /**
   * ROT — FUND 2 (mittel): unmögliche Kalendertage werden akzeptiert.
   * ERWARTET: „31.02.2026" ist kein Datum → Zeile überspringen + Warnung (wie bei „kaputt").
   * TATSÄCHLICH: finanzguruAdapter.ts:41-47 prüft nur `d >= 1 && d <= 31`, ohne Monatslänge
   *   → buchungstag = „2026-02-31".
   * WARUM FALSCH: Der String kommt so in `umsatz.buchungstag` und `ist_buchung.datum`. In
   *   Tagesarithmetik (core/datum.ts:59 tageBis → Date.UTC) rollt er in den 3. März, in
   *   Monatsgruppierung/Sortierung bleibt er im Februar. Dieselbe Buchung liegt je nach
   *   Auswertung in zwei verschiedenen Monaten; die Umbuchungs-Paarung (MAX_PAAR_TAGE)
   *   rechnet mit dem verschobenen Tag.
   */
  it("überspringt unmögliche Kalendertage (31.02.)", () => {
    const erg = finanzguruAdapter.lies(csv(reihe({ tag: "31.02.2026", betrag: "-1,00", gegenpartei: "X" })));
    // Der frühere Beleg für den Folgeschaden („2026-02-31" ist in der Tagesarithmetik der
    // 3. März, in der Monatsgruppierung aber Februar) ist gegenstandslos geworden: seit
    // parseIso die Existenz des Datums prüft, entsteht so ein String gar nicht mehr.
    expect(() => tageBis("2026-02-28", "2026-02-31")).toThrow("datum.ungueltig");
    expect(erg.warnungen.length).toBeGreaterThan(0);
    expect(erg.umsaetze).toHaveLength(0);
  });
});

describe("Betragsparser am Import-Eingang", () => {
  /**
   * ROT — FUND 3 (mittel): Vorzeichen geht verloren, wenn das Minus nicht ASCII und vorn ist.
   * ERWARTET: „−6,55" (U+2212) und „6,55-" (nachgestelltes Minus, in deutschen Bank-/DATEV-
   *   Exporten üblich) sind Abflüsse → −655.
   * TATSÄCHLICH: core/geld.ts:90-92 prüft nur `startsWith("-")` mit ASCII-Bindestrich und
   *   entfernt in Zeile 90 alles außer `[0-9.,-]` — U+2212 fliegt raus, das nachgestellte
   *   Minus zählt nicht → +655. Auch „(6,55)" (Klammer-Negativ) wird +655.
   * WARUM FALSCH: Ein Vorzeichenfehler verdoppelt den Fehlbetrag (Ausgabe wird Einnahme).
   *   Der Adapter reicht den Zellwert ungeprüft an parseBetrag durch (finanzguruAdapter.ts:66),
   *   und die App formatiert selbst mit U+2212 (geld.ts:61) — ein Betrag, den die App anzeigt,
   *   kann sie nicht zurücklesen. (Überschneidet sich mit der Geld-Fläche.)
   */
  it("liest ein typografisches Minus und ein nachgestelltes Minus als Abfluss", () => {
    const uni = finanzguruAdapter.lies(csv(reihe({ tag: "01.11.2021", betrag: "−6,55", gegenpartei: "A" })));
    const nach = finanzguruAdapter.lies(csv(reihe({ tag: "01.11.2021", betrag: "6,55-", gegenpartei: "B" })));
    expect(uni.umsaetze[0].betrag).toBe(-655);
    expect(nach.umsaetze[0].betrag).toBe(-655);
  });
});

describe("Umlaute", () => {
  /**
   * Erbe von FUND 4 (Latin-1 wurde beim Lesen stillschweigend verstümmelt). Der Fund
   * betraf den TEXT-Lesepfad; seit dem Wechsel auf xlsx gibt es ihn hier nicht mehr —
   * XML ist immer UTF-8. Geprüft wird trotzdem, dass Umlaute die neue Strecke heil
   * überstehen (ZIP → XML → Entities → Zelle).
   *
   * Der Lesepfad selbst hat seinen eigenen Test: `adapters/import/dateiText.test.ts`.
   */
  it("liest Umlaute und kaufmännisches Und unverändert", () => {
    const erg = finanzguruAdapter.lies(
      csv(reihe({ tag: T_2021_11_01, betrag: "-1.00", gegenpartei: "Müller & Söhne", zweck: "Straße 5" })),
    );
    expect(erg.umsaetze[0].gegenpartei).toBe("Müller & Söhne");
    expect(erg.umsaetze[0].verwendungszweck).toBe("Straße 5");
  });
});

// ══ 2. Dedup ═══════════════════════════════════════════════════════════════════════

describe("rohHash — Schlüsselstärke", () => {
  /**
   * ROT — FUND 5 (hoch): der Dedup-Schlüssel enthält die Gegenpartei nicht.
   * ERWARTET: Zwei verschiedene Kartenzahlungen (gleicher Tag, gleicher Betrag, LEERER
   *   Verwendungszweck — bei Kartenzahlungen der Normalfall, dort steht nur der Händler)
   *   sind verschiedene Buchungen und müssen beide ankommen.
   * TATSÄCHLICH: rohHash.ts:17-22 verkettet nur Konto|Tag|Betrag|Zweck → identischer
   *   Schlüssel; `klassifiziere` wirft die zweite als Dublette weg (1 neu, 1 duplikat).
   *   Duplikate werden laut umsaetzeUebernehmen.ts:4 NICHT gespeichert, nur gezählt.
   * WARUM FALSCH: Stiller Geldverlust im Ledger. Greift bei jeder Quelle ohne native ID
   *   (Bank-CSV/CAMT — genau der Fall, für den der rohHash gebaut wurde). Zwei Bäckerbrötchen
   *   für 5,00 € am selben Tag: eines verschwindet, ohne dass es irgendwo auftaucht.
   */
  it("unterscheidet zwei ID-lose Buchungen mit verschiedener Gegenpartei", () => {
    const a = roh({ gegenpartei: "Bäcker Schmitt", verwendungszweck: "" });
    const b = roh({ gegenpartei: "Kiosk Meyer", verwendungszweck: "" });
    expect(rohHash(a)).not.toBe(rohHash(b));

    const { neu, duplikate } = klassifiziere(
      [{ rohHash: rohHash(a) }, { rohHash: rohHash(b) }],
      { hashes: [], nativeIds: [] },
    );
    expect(duplikate).toHaveLength(0);
    expect(neu).toHaveLength(2);
  });

  /**
   * ROT — FUND 6 (niedrig): Feldtrenner „|" ist nicht escaped → konstruierbare Kollision.
   * ERWARTET: Zwei fachlich völlig verschiedene Buchungen erzeugen verschiedene Schlüssel.
   * TATSÄCHLICH: rohHash.ts:21 `[konto, tag, betrag, zweck].join("|")` — enthält der
   *   Referenzkonto-Schlüssel ein „|", verschieben sich die Feldgrenzen und beide Tupel
   *   ergeben denselben String.
   * WARUM FALSCH: Der Schlüssel ist als „Verbund-Schlüssel" gedacht (rohHash.ts:4-5); ohne
   *   Escaping ist er nicht injektiv. Praktisch selten (braucht ein „|" im Referenzkonto —
   *   Finanzguru nutzt dort auch quellen-interne IDs, nicht nur IBANs), aber die Folge ist
   *   dieselbe wie bei Fund 5: eine echte Buchung wird als Dublette verworfen.
   */
  it("kollidiert nicht durch verschobene Feldgrenzen", () => {
    const a = { kontoIban: "K|2020-01-01|-5", buchungstag: "2026-01-05", betrag: -500, gegenpartei: "", verwendungszweck: "kaffee" };
    const b = { kontoIban: "K", buchungstag: "2020-01-01", betrag: -5, gegenpartei: "", verwendungszweck: "2026-01-05|-500|kaffee" };
    expect(rohHash(a)).not.toBe(rohHash(b));
  });
});

describe("klassifiziere — Quellen-Asymmetrie", () => {
  /**
   * ROT — FUND 7 (mittel): Dedup über Quellgrenzen wirkt nur in EINER Richtung.
   * ERWARTET: rohHash.ts:2-3 verspricht „Dedup auch über Quellen hinweg (Bank-CSV ↔
   *   Finanzguru)". Ist dieselbe Buchung schon per Bank-CSV (ohne native ID) im Bestand,
   *   darf der Finanzguru-Import sie nicht ein zweites Mal anlegen.
   * TATSÄCHLICH: rohHash.ts:56 — hat der Kandidat eine native ID, entscheidet NUR die ID;
   *   der vorhandene gleiche rohHash wird gar nicht geprüft → 1 neu, 0 duplikate.
   * WARUM FALSCH: Reihenfolgeabhängige Doppelbuchung. Finanzguru zuerst, Bank-CSV danach →
   *   korrekt dedupliziert; andersherum → jede Buchung doppelt im Ledger.
   */
  it("erkennt eine bereits ID-los importierte Buchung auch mit native ID als Dublette", () => {
    const h = rohHash(roh({ verwendungszweck: "Miete Januar" }));
    const { neu, duplikate } = klassifiziere(
      [{ rohHash: h, nativeId: "fg-123" }],
      { hashes: [h], nativeIds: [] },
    );
    expect(duplikate).toHaveLength(1);
    expect(neu).toHaveLength(0);
  });

  /**
   * ROT — FUND 8 (niedrig, latent): native IDs werden ohne Quellen-Qualifizierung verglichen.
   * ERWARTET: Eine „1" aus Quelle A und eine „1" aus Quelle B sind verschiedene Buchungen.
   * TATSÄCHLICH: rohHash.ts:52/56 hält alle nativeIds in EINEM Set; die Umsatz-Tabelle
   *   (migrations.ts v14) speichert die Quelle nicht einmal an der Zeile (nur über lauf_id).
   * WARUM FALSCH: Finanzguru vergibt lange Hex-IDs, da kollidiert nichts. Ein zweiter Adapter
   *   mit fortlaufenden Zeilennummern (CAMT/eigene Bank-CSV) würde beim ersten Import fast
   *   alles als Dublette verwerfen. Heute nicht auslösbar — daher niedrig, aber der Schlüssel
   *   ist an der Naht gebaut, an der genau das passieren soll (quellenAdapter.ts:2-3).
   */
  /**
   * BEWUSST OFFEN — nicht gefixt, und zwar aus einem Grund, der schwerer wiegt als der Fund.
   *
   * Der Fund stimmt: native IDs werden ohne Quellenangabe verglichen, zwei Quellen mit
   * fortlaufenden Zeilennummern würden sich gegenseitig verwerfen. Die Reparatur hiesse,
   * die IDs quellenqualifiziert zu speichern ("quelle|id") — womit die 5198 bereits
   * gespeicherten, unqualifizierten IDs nicht mehr matchen und der nächste
   * Finanzguru-Import ALLES doppelt anlegen würde. Der Fix ist also nur zusammen mit einer
   * Datenmigration richtig.
   *
   * Heute nicht auslösbar: Finanzguru vergibt lange Hex-IDs, und eine zweite Quelle gibt
   * es noch nicht. Der Umbau gehört an dieselbe Stelle wie der Roh-Hash-Backfill — vor
   * die erste weitere Quelle (Roadmap S-6, FinTS), dann beides in einem Zug.
   *
   * Der Test hält bis dahin den IST-Zustand fest, damit die Lücke nicht in Vergessenheit
   * gerät und eine spätere Änderung hier sichtbar wird.
   */
  it("vergleicht native IDs noch ohne Quellenangabe (offen, siehe Kommentar)", () => {
    const ausQuelleB = [{ rohHash: "h-neu", nativeId: "1" }];
    const bestandAusQuelleA = { hashes: ["h-alt"], nativeIds: ["1"], hashesOhneId: [] };
    expect(klassifiziere(ausQuelleB, bestandAusQuelleA).duplikate).toHaveLength(1);
  });
});

describe("umsaetzeUebernehmen — nebenläufiger Import", () => {
  /**
   * ROT — FUND 9 (mittel): zwei gleichzeitige Übernahmen deduplizieren nicht gegeneinander.
   * ERWARTET: Dieselbe Datei zweimal übernommen ergibt eine Buchung (sequenziell tut sie das
   *   auch — siehe grüner Test unten).
   * TATSÄCHLICH: umsaetzeUebernehmen.ts:80 liest `bestandsSchluessel()` als Schnappschuss und
   *   schreibt erst in Zeile 122. Laufen zwei Übernahmen verschränkt, sehen beide den leeren
   *   Bestand → 2 gespeicherte Umsätze mit identischer native ID.
   * WARUM FALSCH: Die Dedup-Invariante hängt allein an diesem Zeitfenster; die DB stützt sie
   *   nicht ab — migrations.ts v14 legt auf roh_hash/native_id nur NICHT-eindeutige Indizes
   *   (ix_umsatz_*), und es gibt keine Transaktion um Lesen+Schreiben. Der Import-Button ist
   *   heute busy-gated (ImportScreen.tsx), deshalb mittel statt hoch: der Use-Case selbst
   *   ist ungeschützt und ist die Stelle, die die Zusage gibt.
   */
  it("legt bei zwei parallelen Übernahmen derselben Datei nur einen Umsatz an", async () => {
    const { deps, umsaetze } = fakes();
    const eingabe: UebernahmeEingabe = {
      quelle: "finanzguru",
      zeitpunkt: "2026-01-06T10:00:00Z",
      rohUmsaetze: [roh({ nativeId: "fg-1" })],
      konten: [{ quelleKey: "DE89370400440532013000", kontoId: "konto-1" }],
    };
    await Promise.all([umsaetzeUebernehmen(eingabe, deps), umsaetzeUebernehmen(eingabe, deps)]);
    expect(umsaetze).toHaveLength(1);
  });
});

// ══ 3. Konto-Zuordnung ═════════════════════════════════════════════════════════════

describe("kontoMatchVorschlag — IBAN-Schreibweisen", () => {
  /**
   * ROT — FUND 10 (mittel): dieselbe IBAN in zwei Schreibweisen wird zu zwei Konten.
   * ERWARTET: „DE89370400440532013000" und „DE89 3704 0044 0532 0130 00" sind dasselbe Konto
   *   → eine Gruppe. Die Funktion normalisiert beim Nachschlagen ja bereits
   *   (kontoMatch.ts:48) und im Anlege-Vorschlag (kontoMatch.ts:58).
   * TATSÄCHLICH: kontoMatch.ts:38-45 gruppiert nach dem ROHEN `u.kontoIban` → drei Gruppen für
   *   dieselbe IBAN, jede mit einem eigenen `neu`-Vorschlag mit identischer normalisierter IBAN.
   * WARUM FALSCH: umsaetzeUebernehmen.ts:60-76 legt jeden `neu`-Eintrag als eigenes
   *   Zahlungskonto an (belegt im zweiten Test) — ein Konto, zwei Datensätze mit derselben
   *   IBAN, Saldo und Umsätze auf beide verteilt. Nicht per Nachimport heilbar.
   */
  it("gruppiert dieselbe IBAN unabhängig von Leerzeichen und Groß-/Kleinschreibung", () => {
    const matches = kontoMatchVorschlag(
      [
        roh({ kontoIban: "DE89370400440532013000", kontoName: "Girokonto" }),
        roh({ kontoIban: "DE89 3704 0044 0532 0130 00", kontoName: "Girokonto" }),
        roh({ kontoIban: "de89370400440532013000", kontoName: "Girokonto" }),
      ],
      [],
    );
    expect(matches).toHaveLength(1);
    expect(matches[0].anzahl).toBe(3);
  });

  /** ROT — Folgeschaden von Fund 10: zwei Zahlungskonten mit identischer IBAN entstehen. */
  it("legt für dieselbe IBAN nur ein Zahlungskonto an", async () => {
    const { deps, konten } = fakes();
    await umsaetzeUebernehmen(
      {
        quelle: "finanzguru",
        zeitpunkt: "2026-01-06T10:00:00Z",
        rohUmsaetze: [roh({ kontoIban: "DE89370400440532013000" }), roh({ kontoIban: "DE89 3704 0044 0532 0130 00", betrag: -600 })],
        konten: [
          { quelleKey: "DE89370400440532013000", neu: { bezeichnung: "Giro", typ: "Giro", iban: "DE89370400440532013000" } },
          { quelleKey: "DE89 3704 0044 0532 0130 00", neu: { bezeichnung: "Giro", typ: "Giro", iban: "DE89370400440532013000" } },
        ],
      },
      deps,
    );
    expect(konten.map((k) => k.iban)).toHaveLength(1);
  });
});

// ══ 4. Verbuchen / Umbuchungs-Paarung ══════════════════════════════════════════════

describe("paareUmbuchungen — Greedy-Fehlgriff", () => {
  /**
   * ROT — FUND 11 (mittel): die gierige Paarung verknüpft ein Paar, das es nie gab.
   * SZENARIO (alles am selben Tag, alles 100 €, alles als Umbuchung markiert), drei Konten
   * kA/kB/kC:
   *   Übertrag 1: kA → kC → Beine A(−100 auf kA) und R(+100 auf kC)
   *   Übertrag 2: kC → kB → Beine Q(−100 auf kC) und P(+100 auf kB)
   * ERWARTET: zwei Paare (A↔R, Q↔P) — die einzige widerspruchsfreie Zuordnung.
   * TATSÄCHLICH: umsatzVerbuchen.ts:57-76 arbeitet greedy: A wird zuerst abgearbeitet und
   *   nimmt das erstbeste Gegenbein mit minimalem Datumsabstand — bei gleichem Tag ist das
   *   das in der Sortierung frühere Konto, hier P auf kB. Ergebnis: ein Paar A↔P, und R und Q
   *   bleiben übrig, obwohl sie zueinander NICHT passen (beide auf kC).
   * WARUM FALSCH: umsatzVerbuchen.ts:93-109 schreibt dann `gegenkontoId` = kB an die
   *   kA-Buchung — ein Übertrag, den es nie gab. R und Q werden als einseitige
   *   Umschichtungen ohne Gegenkonto gebucht, `umbuchungen` im Ergebnis zählt 1 statt 2.
   *   Salden pro Konto bleiben korrekt (jedes Bein bucht auf seinem eigenen Konto).
   * ACHTUNG (ehrlich): Ob es kippt, hängt an der Sortierung der Konto-IDs (Zeile 47-53).
   *   Der zweite Fall unten ist dieselbe Fachlage mit anders sortierten IDs — der geht gut.
   *   Konto-IDs sind crypto.randomUUID(), die Reihenfolge ist also faktisch Zufall.
   */
  it("paart drei Konten korrekt statt gierig zu greifen", () => {
    const kippt = paareUmbuchungen([
      umsatz("A", -10000, "kA"), umsatz("R", 10000, "kC"),
      umsatz("Q", -10000, "kC"), umsatz("P", 10000, "kB"),
    ]);
    // Gegenprobe: identische Fachlage, nur andere Konto-IDs → geht gut. Belegt, dass das
    // Ergebnis an der ID-Sortierung hängt und nicht an den Daten.
    const gehtGut = paareUmbuchungen([
      umsatz("A", -10000, "k-giro"), umsatz("R", 10000, "k-depot"),
      umsatz("Q", -10000, "k-depot"), umsatz("P", 10000, "k-tagesgeld"),
    ]);
    expect(gehtGut.paare).toHaveLength(2);
    expect(kippt.einzeln).toHaveLength(0);
    expect(kippt.paare).toHaveLength(2);
  });
});

// ══ 5. Persistenz / Migrationskette (sql.js, In-Memory) ════════════════════════════

describe("Migrationskette", () => {
  /**
   * ROT — FUND 12 (mittel): Migrationen sind nicht atomar und nicht wiederholbar.
   * ERWARTET: Bricht eine Migration mit mehreren Statements in der Mitte ab (Absturz,
   *   geschlossenes Fenster, Fehler im zweiten Statement), muss der nächste Start sie sauber
   *   nachziehen können.
   * TATSÄCHLICH: db.ts:14-19 führt die Statements ohne BEGIN/COMMIT einzeln aus und trägt die
   *   Version erst danach ein. Nach einem Abbruch nach Statement 1 von v11 steht die Spalte
   *   `transfer_id` bereits, die Version aber nicht → beim nächsten Start läuft v11 erneut und
   *   wirft „duplicate column name: transfer_id".
   * WARUM FALSCH: getDb() lehnt dann dauerhaft ab — die App startet nicht mehr und heilt sich
   *   nicht selbst; ohne manuellen SQL-Eingriff in die Nutzer-DB ist der Zustand endgültig.
   *   Betrifft alle Mehr-Statement-Migrationen (v2, v3, v6, v9, v11, v14).
   */
  it("übersteht eine mittendrin abgebrochene Mehr-Statement-Migration", async () => {
    const v11 = MIGRATIONS.find((m) => m.version === 11)!;
    expect(v11.sql.length).toBeGreaterThan(1);

    const db = new SQL.Database();
    try {
      // Erster Start: v11 bricht nach dem ersten Statement ab (Absturz, Fenster zu, …).
      const abbruch = migrationsDb(db, (sql) => sql === v11.sql[1]);
      await expect(migrate(abbruch)).rejects.toThrow();

      // Die Transaktion muss den Teilzustand zurückgenommen haben: weder die Spalte aus
      // Statement 1 noch der Versionseintrag dürfen stehen geblieben sein.
      expect(version(db)).toBe(10);

      // Zweiter Start, diesmal ohne Abbruch: zieht v11 sauber nach, statt an
      // „duplicate column name" zu scheitern.
      await migrate(migrationsDb(db));
      expect(version(db)).toBe(MIGRATIONS[MIGRATIONS.length - 1].version);
    } finally {
      db.close();
    }
  });

  /**
   * ROT — FUND 13 (niedrig): der Roh-Hash verbuchter Ist-Buchungen wird nie zur Dedup gelesen.
   * ERWARTET: umsatzVerbuchen.ts:4-5 sagt zu, der Roh-Hash wandere mit, „damit ein späterer
   *   Bankimport gegen die verbuchte Zeile deduppen kann" — also muss der Bestand ihn kennen.
   * TATSÄCHLICH: sqliteImportRepositories.ts:153-158 (bestandsSchluessel) liest ausschließlich
   *   aus `umsatz`; `ist_buchung.roh_hash` (migrations.ts v9) wird von keiner Abfrage benutzt.
   * WARUM FALSCH: Solange die Umsatz-Zeile existiert, deckt sie den Fall mit ab — deshalb
   *   niedrig und heute nicht auslösbar (die UI löscht keine Umsätze). Sobald Umsätze
   *   aufgeräumt werden (der Port hat `loeschen`), fällt die Dedup-Grundlage weg, obwohl die
   *   Spalte gefüllt daneben liegt.
   */
  it("kennt den Roh-Hash einer verbuchten Ist-Buchung im Bestand", () => {
    const db = frischeDb();
    db.run(
      `INSERT INTO ist_buchung (id, datum, betrag, konto_id, charakter, quelle, roh_hash)
       VALUES (?,?,?,?,?,?,?)`,
      ["i1", "2026-01-05", -500, "k1", "Aufwand", "import", "h-verbucht"],
    );
    // exakt die Abfrage aus bestandsSchluessel() — sie liest jetzt auch die Roh-Hashes
    // verbuchter Ist-Buchungen, nicht nur die der Umsatz-Zeilen.
    const treffer = db.exec(
      `SELECT roh_hash FROM umsatz
       UNION
       SELECT roh_hash FROM ist_buchung WHERE roh_hash IS NOT NULL`,
    );
    db.close();
    expect(treffer.length).toBe(1);
  });
});

// ══ 6. Was gehalten hat (grün) ═════════════════════════════════════════════════════

describe("Standgehalten — kein Fund", () => {
  it("verkraftet leere Datei, reine Kopfzeile und unbekanntes Format ohne Wurf", () => {
    const leer = new Uint8Array(0);
    expect(finanzguruAdapter.lies(leer).umsaetze).toHaveLength(0);
    expect(finanzguruAdapter.lies(csv()).umsaetze).toHaveLength(0); // nur Kopfzeile
    expect(finanzguruAdapter.erkennt(leer)).toBe(false);
    expect(finanzguruAdapter.erkennt(new TextEncoder().encode("irgendein;text;ohne;header"))).toBe(false);
  });

  it("meldet eine fehlende Betragsspalte, statt Zeilen mit 0 zu verbuchen", () => {
    // „Betrag" verschrieben → die Kopfzeilen-Suche greift nicht mehr.
    const verdreht = KOPF.map((n) => (n === "Betrag" ? "Betrg" : n));
    const erg = finanzguruAdapter.lies(
      xlsxAusZeilen([verdreht, reihe({ tag: T_2021_11_01, betrag: "-1.00" })]),
    );
    expect(erg.umsaetze).toHaveLength(0);
    expect(erg.warnungen.some((w) => w.includes("Kopfzeile") || w.includes("Betrag"))).toBe(true);
  });

  // BOM und CRLF waren Textdatei-Themen und sind mit dem Wechsel auf xlsx entfallen —
  // in einem ZIP mit XML gibt es weder das eine noch das andere. An ihre Stelle tritt
  // die Frage, die bei einem Tabellenblatt wirklich beißt: fehlende Zellen.
  it("verkraftet Zeilen mit ausgelassenen Zellen", () => {
    const kurz = reihe({ tag: T_2021_11_01, betrag: "-1.00", gegenpartei: "A" }).slice(0, 10);
    const erg = finanzguruAdapter.lies(xlsxAusZeilen([KOPF, kurz]));
    expect(erg.umsaetze).toHaveLength(1);
    expect(erg.umsaetze[0].gegenpartei).toBe("A");
    expect(erg.umsaetze[0].nativeId).toBeUndefined();
  });

  it("übersteht sehr lange Zwecke und Sonderzeichen ohne Verlust", () => {
    const zweck = "Ä".repeat(5000) + " '; DROP TABLE umsatz; -- \\   <b>";
    const erg = finanzguruAdapter.lies(csv(reihe({ tag: T_2021_11_01, betrag: "-1.00", gegenpartei: "A", zweck })));
    expect(erg.umsaetze[0].verwendungszweck.length).toBeGreaterThan(5000);
    // Der Hash bleibt stabil und trennt weiterhin (Normalisierung nur Case/Whitespace).
    expect(rohHash(roh({ verwendungszweck: zweck }))).not.toBe(rohHash(roh({ verwendungszweck: zweck + "x" })));
  });

  it("dedupliziert denselben Import sequenziell korrekt", async () => {
    const { deps, umsaetze } = fakes();
    const eingabe: UebernahmeEingabe = {
      quelle: "finanzguru",
      zeitpunkt: "2026-01-06T10:00:00Z",
      rohUmsaetze: [roh({ nativeId: "fg-1" })],
      konten: [{ quelleKey: "DE89370400440532013000", kontoId: "konto-1" }],
    };
    await umsaetzeUebernehmen(eingabe, deps);
    const zweiter = await umsaetzeUebernehmen(eingabe, deps);
    expect(zweiter.duplikate).toBe(1);
    expect(zweiter.neu).toBe(0);
    expect(umsaetze).toHaveLength(1);
  });

  it("überspringt Umsätze ohne aufgelöstes Konto, statt sie irgendwo hinzuschreiben", async () => {
    const { deps, umsaetze } = fakes();
    const erg = await umsaetzeUebernehmen(
      {
        quelle: "finanzguru",
        zeitpunkt: "2026-01-06T10:00:00Z",
        rohUmsaetze: [roh({ kontoIban: "DE00000000000000000000" })],
        konten: [{ quelleKey: "DE89370400440532013000", kontoId: "konto-1" }],
      },
      deps,
    );
    expect(erg.ohneKonto).toBe(1);
    expect(umsaetze).toHaveLength(0);
  });

  it("hält die Invariante: die Ist-Buchung trägt weder Empfänger noch Verwendungszweck", () => {
    const db = frischeDb();
    const spalten = db.exec("PRAGMA table_info(ist_buchung)")[0].values.map((r) => String(r[1]));
    db.close();
    expect(spalten).not.toContain("gegenpartei");
    expect(spalten).not.toContain("verwendungszweck");
    // Gegenprobe: der Umsatz trägt sie und die Ist-Buchung ist über istbuchung_id verbunden.
    const dbu = frischeDb();
    const uSpalten = dbu.exec("PRAGMA table_info(umsatz)")[0].values.map((r) => String(r[1]));
    dbu.close();
    expect(uSpalten).toEqual(expect.arrayContaining(["gegenpartei", "verwendungszweck", "istbuchung_id"]));
  });

  it("hat eine lückenlos aufsteigende, doppelfreie Migrationskette", () => {
    const versionen = MIGRATIONS.map((m) => m.version);
    expect(versionen).toEqual([...versionen].sort((a, b) => a - b));
    expect(new Set(versionen).size).toBe(versionen.length);
    // db.ts nutzt MAX(version) als Wasserstand: eine nachträglich EINGESCHOBENE kleinere
    // Version würde nie laufen. Die Kette ist heute lückenlos 1..n, damit ist das entschärft.
    expect(versionen).toEqual(versionen.map((_, i) => i + 1));
  });
});
