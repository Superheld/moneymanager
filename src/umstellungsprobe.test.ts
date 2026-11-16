// Die Probe der Umstellung auf „eine Rücklage" (ADR-0006, Paket 3).
//
// Die Zusage des Pakets ist eine einzige: **kein vergangener Monat trägt danach eine andere
// Zahl.** Eine Zusage dieser Art lässt sich nicht an Beispielen belegen, die man nach dem
// Umbau aufschreibt — die sagen nur, was der neue Code tut. Deshalb steht die Erwartung
// in `umstellungsprobe.erwartet.json`, und die ist VOR der Umstellung entstanden: mit dem
// Code von `fdfd44c`, auf denselben Beständen, die hier gerechnet werden. Diese Datei
// rechnet sie nach der Umstellung noch einmal und vergleicht jede Zahl.
//
// Was festgehalten ist, je Bestand:
//
//   • die Ergebnisrechnung JEDES Monats eines langen Fensters — jede Zeile, jeder Posten
//     (Plan, Ist, Entnahme, Status), die drei Stufen, die Hochrechnung und die
//     Überleitung;
//   • die Einordnung jedes Anteils jeder Buchung;
//   • Kontobelegung und Deckung an mehreren Stichtagen, dazu der Stand jedes Budgets;
//   • der Monatsausblick.
//
// Die Bestände: der Spielstand (vier Rücklagen und ein aufbauendes Budget an derselben
// Kategorie — der härteste Fall, den die App von selbst erzeugt) und zwei eigens gebaute.
// Jeder wird zweimal gerechnet: so, wie er vor Migration 80 dasteht, und so, wie er nach
// ihr dasteht (freie Rate in der Reihe, `findet_ab` am Tag der Umstellung). Beides muss
// dieselben Zahlen tragen — der Tag der Umstellung liegt nach allen Buchungen.
//
// Die Erwartung neu schreiben heisst, die Zusage aufzugeben. `PROBE_SCHREIBEN=1` gibt es
// nur, um sie auf einem ALTEN Stand zu erzeugen.

import { beforeAll, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";
import {
  aufbauendeAnsprueche,
  budgetStand,
  ergebnisbasis,
  monatsAusblicke,
  monatsErgebnis,
  realerKontostand,
  ruecklagenDeckung,
  type Budget,
  type BudgetSicht,
  type Einordnung,
  type IstBuchung,
  type Kategorie,
  type Ruecklage,
  type Ruecklagenzyklus,
  type Zahlungskonto,
  type Zahlungsregel,
} from "./core";
import { anspruchsbestand, belegungssicht } from "./application/konten/kontobelegung";
import { MIGRATIONS } from "./adapters/persistence/migrations";
import { seedEinspielen } from "./testwerkzeug/seedDaten";
import { pluginApi } from "./testwerkzeug/harness";
import { sqliteLedgerRepository } from "./adapters/persistence/sqliteLedgerRepository";
import { sqliteKategorieRepository, sqliteZahlungskontoRepository } from "./adapters/persistence/sqliteStammdatenRepositories";
import { sqliteBudgetRepository } from "./adapters/persistence/sqliteBudgetRepository";
import { sqliteRuecklagenRepository } from "./adapters/persistence/sqliteRuecklagenRepository";
import { sqliteZahlungsregelRepository } from "./adapters/persistence/sqliteZahlungsregelRepository";
import { sqliteVertragszuordnungRepository } from "./adapters/persistence/sqliteVertragZuordnungRepositories";

const halter = vi.hoisted(() => {
  let aktuell: unknown = null;
  return { setzen: (d: unknown) => (aktuell = d), lesen: () => aktuell };
});
vi.mock("./adapters/persistence/db", () => ({ getDb: async () => halter.lesen() }));

const ERWARTUNG = new URL("./umstellungsprobe.erwartet.json", import.meta.url);
const SCHREIBEN = process.env.PROBE_SCHREIBEN === "1";

/** Ein Bestand, wie die Rechnung ihn liest. */
interface Bestand {
  readonly regeln: readonly Zahlungsregel[];
  readonly budgets: readonly Budget[];
  /** Die laufenden Rücklagen (`RuecklagenRepository.alle()`). */
  readonly ruecklagen: readonly Ruecklage[];
  /** Die beendeten (`RuecklagenRepository.beendete()`). */
  readonly beendete: readonly Ruecklage[];
  readonly ausbuchungen: readonly Ruecklagenzyklus[];
  readonly ist: readonly IstBuchung[];
  readonly kategorien: readonly Kategorie[];
  readonly konten: readonly Zahlungskonto[];
  readonly vertragJeBuchung: ReadonlyMap<string, string>;
  readonly heute: string;
}

interface Fenster {
  readonly monate: readonly string[];
  readonly stichtage: readonly string[];
}

function monateAb(von: string, anzahl: number): string[] {
  const [j, m] = von.split("-").map(Number);
  return Array.from({ length: anzahl }, (_, i) => {
    const n = j * 12 + (m - 1) + i;
    return `${Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, "0")}`;
  });
}

/** Die Einordnung eines Anteils, in einer Form, die vor und nach der Umstellung dasselbe sagt. */
function einordnungKurz(x: Einordnung): string {
  const art = x.art as string;
  const traeger =
    art === "laufend"
      ? `laufend:${x.budgetId}`
      : art === "topf"
        ? `ruecklage:${x.budgetId}`
        : art === "ruecklage"
          ? `ruecklage:${(x as { ruecklageId?: string }).ruecklageId ?? "ausgebucht"}`
          : art;
  return `${x.buchung.id}#${x.anteil}=${traeger}`;
}

/** Alles, was die Probe festhält — Buchungsobjekte als ihre ID, sonst roh. */
function rechnen(b: Bestand, f: Fenster): unknown {
  const eingabe = {
    regeln: b.regeln,
    budgets: b.budgets,
    ruecklagen: b.ruecklagen,
    beendete: b.beendete,
    ausbuchungen: b.ausbuchungen,
    ruecklagenzuordnungen: [],
    ist: b.ist,
    kategorien: b.kategorien,
    konten: b.konten,
    vertragJeBuchung: b.vertragJeBuchung,
    heute: b.heute,
  };
  const basis = ergebnisbasis(eingabe);
  const sicht: BudgetSicht = {
    buchungen: b.ist,
    kategorien: b.kategorien,
    budgets: b.budgets,
    vertragsBuchungen: new Set(b.vertragJeBuchung.keys()),
    ruecklagen: [...b.ruecklagen, ...b.beendete],
    ruecklagenzuordnungen: [],
    ausbuchungen: b.ausbuchungen,
  };
  const staende = new Map(b.konten.map((k) => [k.id, realerKontostand(k, [...b.ist])]));
  const roh = {
    ergebnis: f.monate.map((m) => monatsErgebnis(basis, `${m}-01`)),
    einordnung: basis.einordnungen.map(einordnungKurz),
    belegung: f.stichtage.map((am) => ({
      am,
      jeKonto: [...belegungssicht({ konten: b.konten, buchungen: [...b.ist], ruecklagen: b.ruecklagen, sicht }, am).jeKonto.values()],
    })),
    deckung: f.stichtage.map((am) => ({
      am,
      ...(() => {
        const d = ruecklagenDeckung(b.ruecklagen, am, staende, aufbauendeAnsprueche(sicht, am), anspruchsbestand(sicht));
        return { ...d, posten: d.posten.map((p) => ({ id: p.ruecklage.id, soll: p.soll, tatsaechlich: p.tatsaechlich })) };
      })(),
    })),
    budgetstaende: f.stichtage.flatMap((am) => b.budgets.map((x) => ({ am, id: x.id, ...budgetStand(sicht, x, am) }))),
    ausblick: monatsAusblicke(
      { regeln: b.regeln, budgets: b.budgets, ist: b.ist, kategorien: b.kategorien, vertragsBuchungen: sicht.vertragsBuchungen, heute: b.heute },
      4,
    ),
  };
  return JSON.parse(
    JSON.stringify(roh, (schluessel, wert) => (schluessel === "buchung" && wert && typeof wert === "object" ? wert.id : wert)),
  );
}

// ------------------------------------------------------------------ Bestand A
//
// Mehrere Rücklagen und ein aufbauendes Budget an derselben Kategorie, verschachtelte
// Budgets (ein aufbauendes Dach über einem monatlichen, ein monatliches über einem
// aufbauenden), eine Erstattung, eine geteilte Buchung, eine Buchung vor dem Start des
// aufbauenden Budgets, Vertrag, Umbuchung und eine von Hand aus den Budgets genommene
// Ausgabe ohne Ausbuchung.

function konten(): Zahlungskonto[] {
  return [
    { id: "giro", bezeichnung: "Giro", typ: "Giro", klasse: "liquide", inhaberIds: [], saldo: 500000 },
    { id: "tagesgeld", bezeichnung: "Tagesgeld", typ: "Tagesgeld", klasse: "ruecklage", inhaberIds: [], saldo: 300000 },
    { id: "sparen", bezeichnung: "Sparen", typ: "Tagesgeld", klasse: "sparen", inhaberIds: [], saldo: 120000 },
  ];
}

/** Ein kleiner, fester Würfel — derselbe Bestand bei jedem Lauf. */
function wuerfel(saat: number): () => number {
  let s = saat >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function bestandA(): Bestand {
  const kategorien: Kategorie[] = [
    { id: "k-wohnen", name: "Wohnen", defaultCharakter: "Aufwand" },
    { id: "k-geraete", name: "Geraete", elternId: "k-wohnen", defaultCharakter: "Aufwand" },
    { id: "k-garten", name: "Garten", elternId: "k-wohnen", defaultCharakter: "Aufwand" },
    { id: "k-alltag", name: "Alltag", defaultCharakter: "Aufwand" },
    { id: "k-markt", name: "Markt", elternId: "k-alltag", defaultCharakter: "Aufwand" },
    { id: "k-lohn", name: "Lohn", defaultCharakter: "Ertrag" },
    { id: "k-umbuchen", name: "Umbuchen", defaultCharakter: "Umschichtung" },
  ];
  const budgets: Budget[] = [
    { id: "b-wohnen", kategorieId: "k-wohnen", kontoId: "giro", art: "monatlich", start: "2024-01-01", betraege: [{ abMonat: "2024-01", betrag: 20000 }, { abMonat: "2025-03", betrag: 25000 }] },
    { id: "b-geraete", kategorieId: "k-geraete", kontoId: "tagesgeld", art: "aufbauend", start: "2024-02-15", betraege: [{ abMonat: "2024-02", betrag: 8000 }, { abMonat: "2025-01", betrag: 10000 }] },
    { id: "b-alltag", kategorieId: "k-alltag", kontoId: "giro", art: "aufbauend", start: "2024-01-01", betraege: [{ abMonat: "2024-01", betrag: 5000 }] },
    { id: "b-markt", kategorieId: "k-markt", kontoId: "giro", art: "monatlich", start: "2024-01-01", betraege: [{ abMonat: "2024-01", betrag: 30000 }] },
  ];
  const ruecklagen: Ruecklage[] = [
    { id: "r-ziel", bezeichnung: "Lindqvist", ziel: 120000, fristMonate: 24, beginn: "2024-03-10", kategorieId: "k-geraete", kontoId: "tagesgeld", art: "abschliessend" },
    { id: "r-frei", bezeichnung: "Moorbeck", rate: 4000, beginn: "2024-05-01", kategorieId: "k-geraete", kontoId: "tagesgeld", art: "abschliessend" },
    { id: "r-garten", bezeichnung: "Hasselrot", rate: 2500, beginn: "2024-01-20", kategorieId: "k-garten", kontoId: "sparen", art: "abschliessend" },
    { id: "r-ohne", bezeichnung: "Querfurt", ziel: 50000, fristMonate: 10, beginn: "2025-01-05", art: "abschliessend" },
  ];
  const zufall = wuerfel(161120);
  const ist: IstBuchung[] = [];
  let n = 0;
  const buchen = (datum: string, betrag: number, kategorieId: string | undefined, mehr: Partial<IstBuchung> = {}) => {
    ist.push({ id: `a${++n}`, datum, betrag, kontoId: "giro", kategorieId, charakter: "Aufwand", quelle: "manuell", ...mehr });
  };
  const vertragJeBuchung = new Map<string, string>();
  // Vor dem Start des aufbauenden Budgets an seiner Kategorie: eine Entnahme, die nichts
  // kostet (der bekannte Befund, nachgebildet).
  buchen("2024-01-20", -6400, "k-geraete");
  for (const m of monateAb("2024-01", 26)) {
    const tag = (t: number) => `${m}-${String(t).padStart(2, "0")}`;
    buchen(tag(1), 310000, "k-lohn", { charakter: "Ertrag" });
    buchen(tag(3), -95000, "k-wohnen");
    vertragJeBuchung.set(`a${n}`, "v-miete");
    buchen(tag(5), -Math.round(5000 + zufall() * 20000), "k-wohnen");
    buchen(tag(8), -Math.round(10000 + zufall() * 25000), "k-markt");
    buchen(tag(12), -Math.round(1000 + zufall() * 8000), "k-alltag");
    if (zufall() < 0.45) buchen(tag(14), -Math.round(2000 + zufall() * 30000), "k-geraete");
    if (zufall() < 0.35) buchen(tag(17), -Math.round(1000 + zufall() * 6000), "k-garten");
    // Die Umbuchung aufs Tagesgeld, zwei Beine.
    ist.push({ id: `u${m}a`, datum: tag(20), betrag: -15000, kontoId: "giro", kategorieId: "k-umbuchen", charakter: "Umschichtung", quelle: "manuell", transferId: `t${m}`, gegenkontoId: "tagesgeld" });
    ist.push({ id: `u${m}b`, datum: tag(20), betrag: 15000, kontoId: "tagesgeld", kategorieId: "k-umbuchen", charakter: "Umschichtung", quelle: "manuell", transferId: `t${m}`, gegenkontoId: "giro" });
  }
  // Ein grosser Kauf, der das aufbauende Budget überzieht, und eine Erstattung darauf.
  buchen("2024-09-09", -95000, "k-geraete");
  buchen("2024-10-02", 12000, "k-geraete");
  buchen("2025-04-11", 3500, "k-garten");
  // Eine geteilte Buchung über zwei Budgets.
  buchen("2025-06-21", -35000, undefined, { aufteilungen: [{ kategorieId: "k-geraete", betrag: -30000 }, { kategorieId: "k-markt", betrag: -5000 }] });
  // Von Hand aus den Budgets genommen, ohne dass eine Rücklage ausgebucht wurde: ungeplant.
  buchen("2025-08-13", -42000, "k-wohnen", { budgetrelevant: false });
  buchen("2025-11-28", -18000, "k-geraete", { kontoId: "tagesgeld" });

  const regeln: Zahlungsregel[] = [
    { id: "rg-lohn", bezeichnung: "Lohn", betrag: 310000, rhythmus: "monatlich", startdatum: "2024-01-01", charakter: "Ertrag", kontoId: "giro", vertragId: "v-lohn" } as Zahlungsregel,
    { id: "rg-miete", bezeichnung: "Miete", betrag: -95000, rhythmus: "monatlich", startdatum: "2024-01-03", charakter: "Aufwand", kontoId: "giro", vertragId: "v-miete" } as Zahlungsregel,
  ];
  return {
    regeln,
    budgets,
    ruecklagen,
    beendete: [],
    ausbuchungen: [],
    ist,
    kategorien,
    konten: konten(),
    vertragJeBuchung,
    heute: "2026-02-20",
  };
}

const FENSTER_A: Fenster = {
  monate: monateAb("2023-11", 31),
  stichtage: ["2024-01-01", "2024-03-09", "2024-09-30", "2024-12-31", "2025-06-15", "2026-02-20"],
};

// ------------------------------------------------------------------ Bestand B
//
// Abgeschlossene Zyklen: Kauf vor, im und nach dem Abschlussmonat, mit und ohne
// Geschichte, ein Zyklus ohne Kauf, eine beendete Rücklage, ein Kauf in zwei Ausbuchungen
// (der bekannte Befund: zweimal ungedeckt), ein verknüpfter Kauf, der wieder
// budgetrelevant ist, und ein aufbauendes Budget daneben.

function bestandB(): Bestand {
  const kategorien: Kategorie[] = [
    { id: "k-technik", name: "Technik", defaultCharakter: "Aufwand" },
    { id: "k-reise", name: "Reise", defaultCharakter: "Aufwand" },
    { id: "k-sonst", name: "Sonst", defaultCharakter: "Aufwand" },
    { id: "k-lohn", name: "Lohn", defaultCharakter: "Ertrag" },
  ];
  const budgets: Budget[] = [
    { id: "b-reise", kategorieId: "k-reise", kontoId: "tagesgeld", art: "aufbauend", start: "2024-03-01", betraege: [{ abMonat: "2024-03", betrag: 6000 }] },
    { id: "b-sonst", kategorieId: "k-sonst", kontoId: "giro", art: "monatlich", start: "2024-01-01", betraege: [{ abMonat: "2024-01", betrag: 15000 }] },
  ];
  const ruecklagen: Ruecklage[] = [
    { id: "r-tv", bezeichnung: "Wendhorst", ziel: 90000, fristMonate: 18, beginn: "2025-06-12", kategorieId: "k-technik", kontoId: "tagesgeld", art: "abschliessend" },
    { id: "r-rad", bezeichnung: "Ilsabek", ziel: 40000, fristMonate: 10, beginn: "2025-09-03", kategorieId: "k-technik", kontoId: "tagesgeld", art: "abschliessend" },
    { id: "r-doppel", bezeichnung: "Kronsfeld", ziel: 30000, fristMonate: 6, beginn: "2025-04-01", kontoId: "giro", art: "abschliessend" },
    { id: "r-rel", bezeichnung: "Ostendal", rate: 2000, beginn: "2025-03-01", kategorieId: "k-technik", art: "abschliessend" },
    { id: "r-laeuft", bezeichnung: "Brakholm", rate: 3000, beginn: "2024-02-01", kategorieId: "k-sonst", kontoId: "tagesgeld", art: "abschliessend" },
  ];
  const beendete: Ruecklage[] = [
    { id: "r-reise", bezeichnung: "Sandvoss", rate: 5000, beginn: "2024-08-01", beendetAm: "2025-10-20", kategorieId: "k-reise", kontoId: "tagesgeld", art: "abschliessend" },
  ];
  const zyklus = (id: string, r: Ruecklage, datum: string, mehr: Partial<Ruecklagenzyklus>): Ruecklagenzyklus => ({
    id, ruecklageId: r.id, bezeichnung: r.bezeichnung, kategorieId: r.kategorieId, datum, ...mehr,
  });
  const [tv, rad, doppel, rel] = ruecklagen;
  const ausbuchungen: Ruecklagenzyklus[] = [
    // Ein Zyklus mit Geschichte, ohne Kauf.
    zyklus("a-tv0", tv, "2024-01-05", { zyklusBeginn: "2023-03-01", zyklusZiel: 60000, zyklusFrist: 12 }),
    // Kauf VOR dem Abschlussmonat, überzogen.
    zyklus("a-tv1", tv, "2025-06-12", { zyklusBeginn: "2024-01-05", zyklusZiel: 60000, zyklusFrist: 12, istbuchungId: "kauf-tv1" }),
    // Ohne Geschichte (von vor Migration 76), mit Kauf: gilt als gedeckt.
    zyklus("a-rad0", rad, "2024-06-01", { istbuchungId: "kauf-rad0" }),
    // Kauf IM Abschlussmonat.
    zyklus("a-rad1", rad, "2025-09-03", { zyklusBeginn: "2024-06-01", zyklusZiel: 30000, zyklusFrist: 10, istbuchungId: "kauf-rad1" }),
    // Ein Kauf in zwei Ausbuchungen.
    zyklus("a-d1", doppel, "2025-02-10", { zyklusBeginn: "2024-09-01", zyklusZiel: 20000, zyklusFrist: 5, istbuchungId: "kauf-d" }),
    zyklus("a-d2", doppel, "2025-04-01", { zyklusBeginn: "2025-02-10", zyklusZiel: 20000, zyklusFrist: 5, istbuchungId: "kauf-d" }),
    // Der Kauf ist wieder budgetrelevant: er bleibt bei der Kategorie.
    zyklus("a-rel", rel, "2025-03-01", { zyklusBeginn: "2024-07-01", zyklusRate: 2000, istbuchungId: "kauf-rel" }),
    // Beendet, Kauf NACH dem Abschluss.
    zyklus("a-reise", beendete[0], "2025-10-20", { zyklusBeginn: "2024-08-01", zyklusRate: 5000, istbuchungId: "kauf-reise" }),
  ];
  const zufall = wuerfel(77013);
  const ist: IstBuchung[] = [];
  let n = 0;
  const buchen = (datum: string, betrag: number, kategorieId: string | undefined, mehr: Partial<IstBuchung> = {}) => {
    ist.push({ id: `b${++n}`, datum, betrag, kontoId: "giro", kategorieId, charakter: "Aufwand", quelle: "manuell", ...mehr });
  };
  for (const m of monateAb("2023-06", 31)) {
    const tag = (t: number) => `${m}-${String(t).padStart(2, "0")}`;
    buchen(tag(1), 280000, "k-lohn", { charakter: "Ertrag" });
    buchen(tag(6), -Math.round(4000 + zufall() * 15000), "k-sonst");
    if (zufall() < 0.4) buchen(tag(11), -Math.round(3000 + zufall() * 20000), "k-technik");
    if (zufall() < 0.4) buchen(tag(16), -Math.round(3000 + zufall() * 12000), "k-reise");
  }
  const kauf = (id: string, datum: string, betrag: number, kategorieId: string, budgetrelevant = false) =>
    ist.push({ id, datum, betrag, kontoId: "giro", kategorieId, charakter: "Aufwand", quelle: "manuell", budgetrelevant });
  kauf("kauf-tv1", "2025-05-28", -80000, "k-technik");
  kauf("kauf-rad0", "2024-05-30", -20000, "k-technik");
  kauf("kauf-rad1", "2025-09-03", -45000, "k-technik");
  kauf("kauf-d", "2025-03-15", -26000, "k-technik");
  kauf("kauf-rel", "2025-02-20", -9000, "k-technik", true);
  kauf("kauf-reise", "2025-11-02", -70000, "k-reise");
  return {
    regeln: [],
    budgets,
    ruecklagen,
    beendete,
    ausbuchungen,
    ist,
    kategorien,
    konten: konten(),
    vertragJeBuchung: new Map(),
    heute: "2026-01-15",
  };
}

const FENSTER_B: Fenster = {
  monate: monateAb("2023-01", 40),
  stichtage: ["2024-01-04", "2024-06-01", "2025-02-28", "2025-06-12", "2025-10-21", "2026-01-15"],
};

// ------------------------------------------------------------------ Bestand C: der Spielstand

const STICHTAG = new Date(2026, 5, 15);
const HEUTE_SEED = "2026-06-15";
const FENSTER_C: Fenster = {
  monate: monateAb("2024-10", 24),
  stichtage: ["2024-12-31", "2025-06-30", "2026-01-31", "2026-06-15"],
};

let SQL: SqlJsStatic;
beforeAll(async () => {
  const require = createRequire(import.meta.url);
  SQL = await initSqlJs({ locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm") });
});

/** Der Spielstand in einer Datenbank, die bis einschliesslich `bis` migriert ist. */
function spielstand(bis: number): Database {
  const db = new SQL.Database();
  for (const m of MIGRATIONS.filter((x) => x.version <= bis)) for (const sql of m.sql) db.run(sql);
  seedEinspielen(db, STICHTAG);
  return db;
}

async function bestandAus(db: Database): Promise<Bestand> {
  halter.setzen(pluginApi(db));
  const [regeln, budgets, ruecklagen, beendete, ausbuchungen, ist, kategorien, kontenListe, zuordnungen] = await Promise.all([
    sqliteZahlungsregelRepository.alle(),
    sqliteBudgetRepository.alle(),
    sqliteRuecklagenRepository.alle(),
    sqliteRuecklagenRepository.beendete(),
    sqliteRuecklagenRepository.ausbuchungen(),
    sqliteLedgerRepository.alle(),
    sqliteKategorieRepository.alle(),
    sqliteZahlungskontoRepository.alle(),
    sqliteVertragszuordnungRepository.alle(),
  ]);
  const vertragJeBuchung = new Map<string, string>();
  for (const z of zuordnungen) if (z.vertragId) vertragJeBuchung.set(z.istbuchungId, z.vertragId);
  return { regeln, budgets, ruecklagen, beendete, ausbuchungen, ist, kategorien, konten: kontenListe, vertragJeBuchung, heute: HEUTE_SEED };
}

// ------------------------------------------------------------------ der Vergleich

/**
 * Ein Bestand so, wie Migration 80 ihn hinterlässt: die freie Rate in der Reihe, `rate`
 * leer, und eine laufende Rücklage von Hand mit Kategorie findet ab dem Tag der Umstellung.
 */
function migriert(b: Bestand, umstellung: string): Bestand {
  const umstellen = (r: Ruecklage, beendet: boolean): Ruecklage => {
    const mitZiel = (r.ziel ?? 0) > 0 && (r.fristMonate ?? 0) > 0;
    const frei = !mitZiel && (r.rate ?? 0) > 0;
    return {
      ...r,
      rate: frei ? undefined : r.rate,
      raten: frei ? [{ abMonat: r.beginn.slice(0, 7), betrag: r.rate as number }] : r.raten,
      findetAb: !beendet && r.kategorieId && (r.art ?? "abschliessend") === "abschliessend" && !r.findetAb ? umstellung : r.findetAb,
    };
  };
  return { ...b, ruecklagen: b.ruecklagen.map((r) => umstellen(r, false)), beendete: b.beendete.map((r) => umstellen(r, true)) };
}

type Erwartung = Record<string, unknown>;
const erwartung: Erwartung = SCHREIBEN ? {} : JSON.parse(readFileSync(ERWARTUNG, "utf8"));

describe("Probe der Umstellung: vergangene Monate tragen dieselben Zahlen", () => {
  const faelle: [string, () => Promise<Bestand> | Bestand, Fenster, string][] = [
    ["A", bestandA, FENSTER_A, "2026-02-20"],
    ["B", bestandB, FENSTER_B, "2026-01-15"],
  ];
  for (const [name, bauen, fenster, umstellung] of faelle) {
    it(`Bestand ${name}, wie er vor Migration 80 dasteht`, async () => {
      const ergebnis = rechnen(await bauen(), fenster);
      if (SCHREIBEN) erwartung[name] = ergebnis;
      else expect(ergebnis).toEqual(erwartung[name]);
    });
    if (!SCHREIBEN) {
      it(`Bestand ${name}, wie Migration 80 ihn hinterlässt`, async () => {
        expect(rechnen(migriert(await bauen(), umstellung), fenster)).toEqual(erwartung[name]);
      });
    }
  }

  it("Spielstand, wie er vor Migration 80 dasteht", async () => {
    const ergebnis = rechnen(await bestandAus(spielstand(79)), FENSTER_C);
    if (SCHREIBEN) erwartung.C = ergebnis;
    else expect(ergebnis).toEqual(erwartung.C);
  });

  if (!SCHREIBEN) {
    it("Spielstand nach Migration 80", async () => {
      const db = spielstand(79);
      for (const m of MIGRATIONS.filter((x) => x.version === 80)) for (const sql of m.sql) db.run(sql);
      const b = await bestandAus(db);
      // Der Tag der Umstellung ist der echte heutige; er liegt nach jeder Buchung des Spielstands.
      expect(b.ruecklagen.every((r) => !!r.findetAb && r.findetAb > HEUTE_SEED)).toBe(true);
      expect(rechnen(b, FENSTER_C)).toEqual(erwartung.C);
    });
  }

  if (SCHREIBEN) {
    it("schreibt die Erwartung", () => {
      writeFileSync(ERWARTUNG, JSON.stringify(erwartung));
    });
  }
});
