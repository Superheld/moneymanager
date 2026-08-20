// Robustheits-Tests „Geld & Rechnen" (Branch test/robustheit).
//
// Ziel: die zentrale Invariante aus CLAUDE.md — **Geld ist immer Integer Cent, nie
// Float** — und die Rundungs-/Vorzeichen-Ränder unter Druck setzen. Tests, die einen
// echten Fund belegen, sind mit [ROT] markiert und dürfen fehlschlagen; sie
// beschreiben im Kommentar erwartet/tatsächlich/warum falsch. Tests mit [GRÜN] sichern
// Verhalten ab, das nachweislich hält.
//
// Kein Produktivcode wurde geändert.

import { describe, it, expect } from "vitest";
import {
  budgetVerbrauch,
  geldFormatieren,
  kontoRegister,
  liquideMittel,
  minorZuMajor,
  parseBetrag,
  sollRuecklage,
  type Budget,
  type Cent,
  type Inventargegenstand,
  type IstBuchung,
  type Zahlungskonto,
} from ".";
import { STANDARD_WAEHRUNG, waehrungNachCode, type Waehrung } from "./basis/waehrung";
import { geldFormatierenMitSymbol } from "./basis/geld";
import { buchungErfassen } from "../application/buchung/buchungErfassen";
import { umbuchungErfassen } from "../application/buchung/umbuchungErfassen";
import { budgetAnlegen } from "../application/budgets/budgetAnlegen";
import { inventarAnlegen } from "../application/inventar/inventarAnlegen";
import type { BudgetRepository, LedgerPort } from "../application/ports";

const EUR = STANDARD_WAEHRUNG;
const JPY: Waehrung = { code: "JPY", skala: 0 };

// ── Test-Doubles ──────────────────────────────────────────────────────────────

function memLedger(): LedgerPort & { daten: IstBuchung[] } {
  const daten: IstBuchung[] = [];
  return {
    daten,
    async alle() { return [...daten]; },
    async speichern(b) {
      const i = daten.findIndex((x) => x.id === b.id);
      if (i >= 0) daten[i] = b; else daten.push(b);
    },
    async loeschen(id) {
      const i = daten.findIndex((x) => x.id === id);
      if (i >= 0) daten.splice(i, 1);
    },
  };
}

function memBudgets(): BudgetRepository & { daten: Budget[] } {
  const daten: Budget[] = [];
  return {
    daten,
    async alle() { return [...daten]; },
    async speichern(b) { daten.push(b); },
    async loeschen(id) { const i = daten.findIndex((x) => x.id === id); if (i >= 0) daten.splice(i, 1); },
  };
}

function ist(p: Partial<IstBuchung> & { betrag: Cent }): IstBuchung {
  return {
    id: p.id ?? Math.random().toString(36).slice(2),
    datum: p.datum ?? "2026-06-15",
    kontoId: p.kontoId ?? "k1",
    charakter: p.charakter ?? "Aufwand",
    quelle: p.quelle ?? "manuell",
    ...p,
  } as IstBuchung;
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. parseBetrag — Vorzeichen
// ══════════════════════════════════════════════════════════════════════════════

describe("parseBetrag — Vorzeichen", () => {
  // [ROT] Fund 1 — nachgestelltes Minus kippt das Vorzeichen.
  // Erwartet: „1.234,56-" → −123456 (nachgestelltes Minus ist die gängige Konvention
  //   in deutschen Bank-/SAP-/DATEV-CSV-Exporten und in Excel-Buchhaltungsformaten).
  // Tatsächlich: +123456. geld.ts:92 prüft nur `bereinigt.startsWith("-")`; das Minus
  //   am Ende wird in Zeile 93 kommentarlos weggeworfen.
  // Warum falsch: Der Adapter (adapters/import/finanzguruAdapter.ts:66) reicht
  //   ungeprüften CSV-Text hier hinein. Eine Ausgabe wird zur Einnahme — Saldo, Historie
  //   und Budgetverbrauch liegen um den doppelten Betrag daneben, ohne jede Warnung.
  it("[ROT] nachgestelltes Minus bleibt negativ", () => {
    expect(parseBetrag("1.234,56-", EUR)).toBe(-123456);
  });

  // [ROT] Fund 2 — das eigene U+2212-Minus wird verschluckt.
  // Erwartet: Round-Trip geldFormatieren(−x) → parseBetrag → −x.
  // Tatsächlich: parseBetrag liefert +x. geld.ts:90 filtert mit /[^0-9.,-]/g auf den
  //   ASCII-Bindestrich; das U+2212, das geldFormatieren (geld.ts:61) selbst erzeugt,
  //   fällt heraus.
  // Warum falsch: Die App produziert einen String, den sie selbst nicht mehr korrekt
  //   liest. Copy/Paste aus einer eigenen Tabelle in ein Betragsfeld dreht das Vorzeichen.
  it("[ROT] Round-Trip über das eigene Ausgabeformat erhält das Vorzeichen", () => {
    const formatiert = geldFormatieren(-123456, { waehrung: EUR, locale: "de-DE" });
    expect(formatiert).toBe("−1.234,56"); // U+2212
    expect(parseBetrag(formatiert, EUR)).toBe(-123456);
  });

  // [ROT] Fund 2b — Klammer-Notation (Buchhaltung) verliert ebenfalls das Vorzeichen.
  // Erwartet: „(1.234,56)" → −123456 oder null (klare Ablehnung).
  // Tatsächlich: +123456 — die Klammern werden stillschweigend entfernt.
  it("[ROT] Klammer-Notation wird nicht als negativ gelesen", () => {
    expect(parseBetrag("(1.234,56)", EUR)).toBe(-123456);
  });

  // [GRÜN] führendes Minus funktioniert wie dokumentiert.
  it("[GRÜN] führendes ASCII-Minus wird korrekt gelesen", () => {
    expect(parseBetrag("-1.234,56", EUR)).toBe(-123456);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. parseBetrag — stilles Fehlparsen statt null
// ══════════════════════════════════════════════════════════════════════════════

describe("parseBetrag — Müll-Eingaben", () => {
  // [ROT] Fund 3 — unplausible Eingaben liefern eine Zahl statt null.
  // Erwartet: null (der Vertrag der Funktion lautet „null bei leerer/unparsebarer
  //   Eingabe"; der Import wertet null als „Zeile übersprungen" + Warnung aus).
  // Tatsächlich: „1-2" → 1200, „12,34,56" → 123456, „1.2.3" → 1230.
  // Warum falsch: geld.ts:93 entfernt ALLE Minuszeichen und geld.ts:99 alle Trenner
  //   links vom rechtesten — es gibt keine Struktur-Prüfung. Ein Tippfehler im
  //   Betragsfeld oder eine kaputte CSV-Zelle wird nicht abgelehnt, sondern als falscher
  //   Betrag verbucht. Genau die Zeilen, die als Warnung sichtbar werden müssten,
  //   rutschen still durch.
  it("[ROT] „1-2“ ist kein gültiger Betrag", () => {
    expect(parseBetrag("1-2", EUR)).toBeNull();
  });
  it("[ROT] „12,34,56“ ist kein gültiger Betrag", () => {
    expect(parseBetrag("12,34,56", EUR)).toBeNull();
  });
  it("[ROT] „1.2.3“ ist kein gültiger Betrag", () => {
    expect(parseBetrag("1.2.3", EUR)).toBeNull();
  });

  // [ROT] Fund 4 — keine Obergrenze: das Ergebnis ist kein sicherer Integer mehr.
  // Erwartet: Entweder null oder ein Wert mit Number.isSafeInteger === true —
  //   sonst ist die Cent-Invariante („Integer Cent") verletzt, bevor irgendetwas rechnet.
  // Tatsächlich: 1e22. Ab 2^53 Cent ist jede Addition verlustbehaftet und
  //   Number.isInteger(1e22) ist zwar true, aber isSafeInteger false — Saldo-Summen
  //   werden ab hier lautlos falsch.
  // Warum falsch: Der Wert stammt aus einem Textfeld bzw. einer CSV-Zelle. Ein
  //   Fat-Finger („zu viele Nullen") vergiftet jede spätere Summe unumkehrbar.
  it("[ROT] extrem große Eingabe liefert keinen unsicheren Integer", () => {
    const c = parseBetrag("99999999999999999999", EUR);
    expect(c === null || Number.isSafeInteger(c)).toBe(true);
  });

  // [ROT] Fund 4b — Exponentialschreibweise wird zu einer anderen Zahl.
  // Erwartet: null (oder 100000). Tatsächlich: „1e3" → das „e" wird weggefiltert,
  //   übrig bleibt „13" → 1300. Aus 1000 € werden 13 €.
  // Reachable: String(minorZuMajor(x)) liefert bei sehr großen Werten
  //   Exponentialschreibweise; die Edit-Formulare befüllen ihre Felder genau so
  //   (z. B. KontenScreen.tsx:452, VertraegeScreen.tsx:135).
  it("[ROT] Exponentialschreibweise wird nicht still zu einer anderen Zahl", () => {
    expect(parseBetrag("1e3", EUR)).toBeNull();
  });

  // [GRÜN] die dokumentierte „rechtester Trenner"-Regel hält für beide Locales.
  it("[GRÜN] deutsche und englische Schreibweise ergeben denselben Betrag", () => {
    expect(parseBetrag("1.234,56", EUR)).toBe(123456);
    expect(parseBetrag("1,234.56", EUR)).toBe(123456);
  });

  // [GRÜN] dokumentierter Tradeoff, hier nur festgenagelt: „1.234" (deutscher
  // Tausenderpunkt ohne Nachkomma) wird als 1,234 gelesen → 123 Cent. Das ist die in
  // geld.ts:85-87 bewusst gewählte Regel, kein Versehen — aber ein Faktor 1000 für eine
  // Eingabe, die ein deutscher Nutzer als „1234 €" meint.
  it("[GRÜN/Risiko] „1.234“ wird per Regel als 1,234 gelesen (123 Cent)", () => {
    expect(parseBetrag("1.234", EUR)).toBe(123);
  });

  // [GRÜN] Sub-Cent-Eingaben werden korrekt auf die kleinste Einheit gerundet.
  it("[GRÜN] „0,004“ rundet auf 0 Cent (nicht auf einen Float)", () => {
    expect(parseBetrag("0,004", EUR)).toBe(0);
    expect(Number.isInteger(parseBetrag("0,004", EUR))).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. Cent-Invariante an der Use-Case-Grenze
// ══════════════════════════════════════════════════════════════════════════════

describe("Use-Cases — Integer-Cent-Invariante", () => {
  // [ROT] Fund 5 — Nachkomma-„Cents" kommen ungeprüft durch.
  // Erwartet: buchungErfassen lehnt einen nicht-ganzzahligen Betrag ab (Invariante
  //   „Geld = Integer Cent, nie Float", CLAUDE.md).
  // Tatsächlich: gespeichert wird betrag = −10.5. buchungErfassen.ts:26 prüft nur
  //   `!(e.betrag > 0)`; das lässt jeden positiven Float passieren.
  // Warum falsch: Ab hier ist der Kern kontaminiert — jede Folgesumme rechnet in
  //   Binär-Gleitkomma (siehe nächster Test), und die DB speichert einen Wert, den
  //   niemand mehr als Cent interpretieren kann.
  it("[ROT] buchungErfassen lehnt Nachkommastellen ab", async () => {
    const ledger = memLedger();
    await expect(
      buchungErfassen(ledger, { kontoId: "k1", datum: "2026-06-01", betrag: 10.5, charakter: "Aufwand" }),
    ).rejects.toThrow();
  });

  // [ROT] Fund 5b — Infinity passiert die Validierung ebenfalls.
  // Erwartet: Ablehnung. Tatsächlich: `Infinity > 0` ist true → gespeichert wird
  //   betrag = −Infinity. Jeder Saldo, in den diese Buchung eingeht, wird −Infinity.
  it("[ROT] buchungErfassen lehnt Infinity ab", async () => {
    const ledger = memLedger();
    await expect(
      buchungErfassen(ledger, { kontoId: "k1", datum: "2026-06-01", betrag: Infinity, charakter: "Aufwand" }),
    ).rejects.toThrow();
  });

  // [ROT] Fund 5c — dieselbe Lücke in umbuchungErfassen und budgetAnlegen.
  it("[ROT] umbuchungErfassen lehnt Nachkommastellen ab", async () => {
    const ledger = memLedger();
    await expect(
      umbuchungErfassen(ledger, { vonKontoId: "a", nachKontoId: "b", datum: "2026-06-01", betrag: 33.33 }),
    ).rejects.toThrow();
  });
  it("[ROT] budgetAnlegen lehnt Nachkommastellen ab", async () => {
    const repo = memBudgets();
    await expect(
      budgetAnlegen(repo, { kategorieId: "k", kontoId: "k1", betragProMonat: 40000.5, art: "monatlich", start: "2026-06-01" }),
    ).rejects.toThrow();
  });

  // [ROT] Fund 5d — Beleg für die Folgekosten: Float-Cents brechen die Saldo-Rechnung.
  // Erwartet: der laufende Saldo in kontoRegister ist ein exakter Integer.
  // Tatsächlich: 10.1 + 20.2 = 30.299999999999997 — der klassische Binär-Rundungsfehler,
  //   genau der, gegen den die Cent-Invariante existiert. Der Test zeigt, dass der Kern
  //   selbst keinerlei Schutz hat, sobald ein Float hereinkommt.
  it("[ROT] laufender Saldo bleibt ganzzahlig, auch bei Float-Eingaben", () => {
    const konto: Zahlungskonto = { id: "k1", bezeichnung: "Giro", typ: "Giro", klasse: "liquide", inhaberIds: [], saldo: 0 };
    const buchungen = [
      ist({ betrag: 10.1, datum: "2026-06-01", charakter: "Ertrag" }),
      ist({ betrag: 20.2, datum: "2026-06-02", charakter: "Ertrag" }),
    ];
    const reg = kontoRegister(konto, buchungen, [], "2026-06-03", 0);
    expect(Number.isInteger(reg.standHeute)).toBe(true);
  });

  // [GRÜN] mit sauberen Integer-Cents hält die Summe exakt — auch über viele Buchungen.
  it("[GRÜN] 10.000 Integer-Buchungen summieren exakt", () => {
    const konto: Zahlungskonto = { id: "k1", bezeichnung: "Giro", typ: "Giro", klasse: "liquide", inhaberIds: [], saldo: 0 };
    const buchungen = Array.from({ length: 10_000 }, (_, i) =>
      ist({ betrag: i % 2 === 0 ? 1 : -1, datum: "2026-06-01", charakter: "Ertrag" }),
    );
    const reg = kontoRegister(konto, buchungen, [], "2026-06-02", 0);
    expect(reg.standHeute).toBe(0);
    expect(Number.isSafeInteger(reg.standHeute)).toBe(true);
  });

  // [GRÜN] 0 und negative Beträge werden korrekt abgelehnt.
  it("[GRÜN] Betrag 0 und negative Beträge werden abgelehnt", async () => {
    const ledger = memLedger();
    await expect(buchungErfassen(ledger, { kontoId: "k1", datum: "2026-06-01", betrag: 0, charakter: "Aufwand" })).rejects.toThrow("betrag.groesserNull");
    await expect(buchungErfassen(ledger, { kontoId: "k1", datum: "2026-06-01", betrag: -100, charakter: "Aufwand" })).rejects.toThrow("betrag.groesserNull");
    await expect(buchungErfassen(ledger, { kontoId: "k1", datum: "2026-06-01", betrag: NaN, charakter: "Aufwand" })).rejects.toThrow("betrag.groesserNull");
  });

  // [GRÜN] negative Null wird nicht als negativer Betrag angezeigt.
  it("[GRÜN] −0 formatiert als „0,00“, nicht als „−0,00“", () => {
    expect(geldFormatieren(-0, { waehrung: EUR, locale: "de-DE" })).toBe("0,00");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. Validierung vor Rundung, und ob sich Anteile wieder zum Ganzen summieren
//
// Die Topf-Hälfte dieses Abschnitts ist mit den Töpfen entfallen (2026-08-19). Was
// bleibt, ist derselbe Fehlertyp am Inventar — dort rechnet die Rücklage weiter.
// ══════════════════════════════════════════════════════════════════════════════

describe("Inventar — Validierung vor Rundung", () => {
  // [ROT] Fund 6 — `> 0` wird VOR dem Runden geprüft, gerundet wird danach auf 0.
  // Erwartet: nutzungsdauerMonate 0.4 wird abgelehnt. Tatsächlich (damals): die Prüfung
  //   ließ 0.4 durch, `Math.round(0.4)` machte 0 daraus, und das Aggregat lag dauerhaft
  //   kaputt in der DB — jede Rate daraus wurde Infinity, jeder Sollstand NaN.
  // GRÜN seit dem Fix: gerundet wird VOR der Prüfung.
  it("nutzungsdauerMonate 0.4 wird abgelehnt statt zu 0 gerundet", async () => {
    const gespeichert: Inventargegenstand[] = [];
    const repo = {
      alle: async () => gespeichert,
      speichern: async (g: Inventargegenstand) => { gespeichert.push(g); },
      loeschen: async () => {},
    };
    await expect(inventarAnlegen(repo, {
      bezeichnung: "Kaputt", wiederbeschaffung: 120000,
      nutzungsdauerMonate: 0.4, anschaffung: "2026-06-01",
    })).rejects.toThrow("nutzungsdauer.groesserNull");
    expect(gespeichert).toHaveLength(0);
  });

  // [ROT] Fund 7 — die Rate erreicht das Ziel am Ende der Nutzungsdauer nicht.
  // Erwartet: nach genau `nutzungsdauerMonate` Monaten ist der Sollstand == Zielwert.
  //   Das ist die fachliche Zusage der Inventar-Rücklage: am Ende ist die
  //   Wiederbeschaffung beisammen.
  // Tatsächlich (damals): 1000 Cent / 3 Monate → Math.round(333,33) = 333 → nach drei
  //   Monaten 999. Der Restcent wurde nirgends verteilt, und die Abweichung wuchs mit
  //   der Zahl der Perioden.
  it("Inventar-Rücklage erreicht das Ziel am Ende der Nutzungsdauer exakt", () => {
    const g: Inventargegenstand = {
      id: "g", bezeichnung: "Krumm", wiederbeschaffung: 1000,
      nutzungsdauerMonate: 3, anschaffung: "2026-01-01",
    };
    expect(sollRuecklage(g, "2026-04-01")).toBe(1000);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 6. budgetVerbrauch — Math.abs frisst das Vorzeichen
// ══════════════════════════════════════════════════════════════════════════════

const LEBENSMITTEL_BUDGET: Budget = {
  id: "b-lm", kategorieId: "lebensmittel", kontoId: "k1",
  betragProMonat: 40000, art: "monatlich", start: "2026-01-01",
};

describe("budgetVerbrauch — Erstattungen", () => {
  // [ROT] Fund 9 — eine Erstattung ERHÖHT den Budgetverbrauch.
  // Erwartet: Einkauf −50 € plus Rückerstattung +20 € auf derselben Kategorie ergeben
  //   30 € Verbrauch.
  // Tatsächlich: 70 € — budget.ts:66 summiert `Math.abs(b.betrag)`, das Vorzeichen der
  //   Erstattung geht verloren. Fehler = 2× Erstattungsbetrag.
  // Warum reachable: Der Import verbucht `betrag: u.betrag` (Vorzeichen aus der CSV)
  //   zusammen mit `charakter: kategorie.defaultCharakter`
  //   (application/import/umsatzVerbuchen.ts:120/122). Eine Rücküberweisung eines
  //   Händlers in Kategorie „Lebensmittel" landet damit als positiver Aufwand im Ledger.
  // Warum falsch: Historie rechnet vorzeichenrichtig (historie.ts:118), Budget nicht —
  //   zwei Screens zeigen für dieselben Daten verschiedene Zahlen, und der Budget-Rest
  //   ist zu klein.
  it("[ROT] Erstattung senkt den Budgetverbrauch", () => {
    const buchungen = [
      ist({ betrag: -5000, datum: "2026-06-05", kategorieId: "lebensmittel", charakter: "Aufwand" }),
      ist({ betrag: 2000, datum: "2026-06-12", kategorieId: "lebensmittel", charakter: "Aufwand" }),
    ];
    const b = LEBENSMITTEL_BUDGET;
    expect(budgetVerbrauch({ buchungen: buchungen, kategorien: [], budgets: [b], vertragsBuchungen: new Set() }, b, "2026-06-01", "2026-07-01")).toBe(3000);
  });

  // [GRÜN] reine Abflüsse werden korrekt aufsummiert und gefenstert.
  it("[GRÜN] nur Aufwände der Kategorie im Fenster zählen", () => {
    const buchungen = [
      ist({ betrag: -5000, datum: "2026-06-05", kategorieId: "lebensmittel", charakter: "Aufwand" }),
      ist({ betrag: -1000, datum: "2026-05-31", kategorieId: "lebensmittel", charakter: "Aufwand" }), // vor Fenster
      ist({ betrag: -2000, datum: "2026-06-07", kategorieId: "andere", charakter: "Aufwand" }),
      ist({ betrag: -3000, datum: "2026-06-08", kategorieId: "lebensmittel", charakter: "Umschichtung" }),
    ];
    const b = LEBENSMITTEL_BUDGET;
    expect(budgetVerbrauch({ buchungen: buchungen, kategorien: [], budgets: [b], vertragsBuchungen: new Set() }, b, "2026-06-01", "2026-07-01")).toBe(5000);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 8. Formatierung — Extremwerte und Locale
// ══════════════════════════════════════════════════════════════════════════════

describe("geldFormatieren — Ränder", () => {
  // [ROT] Fund 11 — nicht-endliche Werte werden ungefiltert angezeigt.
  // Erwartet: ein Platzhalter („—") oder ein geworfener Fehler.
  // Tatsächlich: „NaN" bzw. „∞" landen direkt in der UI. In Kombination mit Fund 6
  //   ist das der sichtbare Endzustand: der Nutzer sieht „NaN €" ohne jeden Hinweis,
  //   welcher Datensatz schuld ist.
  it("[ROT] NaN wird nicht als „NaN“ ausgegeben", () => {
    expect(geldFormatieren(NaN, { waehrung: EUR, locale: "de-DE" })).not.toBe("NaN");
  });
  it("[ROT] Infinity wird nicht als „∞“ ausgegeben", () => {
    expect(geldFormatieren(Infinity, { waehrung: EUR, locale: "de-DE" })).not.toBe("∞");
  });

  // [ROT] Fund 11b — schon bei MAX_SAFE_INTEGER Cent verliert die Anzeige einen Cent.
  // Erwartet: 9007199254740991 Cent → „90.071.992.547.409,91".
  // Tatsächlich: „90.071.992.547.409,90". geld.ts:56 rechnet `Math.abs(cent) / 100`
  //   und verlässt damit den sicheren Integer-Bereich: 90071992547409.91 ist als
  //   Double nicht exakt darstellbar, toLocaleString rundet ab.
  // Warum das zählt: Der Wert selbst ist ein gültiger sicherer Integer — die Division
  //   nach Major macht ihn kaputt, nicht die Eingabe. Die Formatierung ist also nicht
  //   über den gesamten Wertebereich verlustfrei, den der Typ Cent zulässt.
  //   Praktisch trifft das nur absurde Beträge (900 Mrd. €), erreichbar über Fund 4.
  it("[ROT] MAX_SAFE_INTEGER formatiert verlustfrei", () => {
    const s = geldFormatieren(Number.MAX_SAFE_INTEGER, { waehrung: EUR, locale: "de-DE" });
    expect(s).toBe("90.071.992.547.409,91");
  });

  // [GRÜN] in realistischen Größenordnungen ist die Formatierung exakt.
  it("[GRÜN] Milliardenbetrag formatiert exakt", () => {
    expect(geldFormatieren(123_456_789_012, { waehrung: EUR, locale: "de-DE" })).toBe("1.234.567.890,12");
  });

  // [GRÜN] Locale-Umschaltung ändert nur die Darstellung, nicht den Wert.
  it("[GRÜN] gleiche Cents, verschiedene Locales, gleicher Wert", () => {
    expect(geldFormatieren(1234567, { waehrung: EUR, locale: "de-DE" })).toBe("12.345,67");
    expect(geldFormatieren(1234567, { waehrung: EUR, locale: "en-US" })).toBe("12,345.67");
  });

  // [GRÜN] Skala-0-Währung erzeugt keine Nachkommastellen.
  it("[GRÜN] JPY ohne Nachkommastellen", () => {
    expect(geldFormatieren(1200, { waehrung: JPY, locale: "de-DE" })).toBe("1.200");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 9. Währungs-Skala im Import-Pfad
// ══════════════════════════════════════════════════════════════════════════════

describe("parseBetrag — Haushaltswährung", () => {
  // [ROT/latent] Fund 12 — der Import parst immer mit der Standardwährung.
  // adapters/import/finanzguruAdapter.ts:66 ruft `parseBetrag(text)` ohne
  //   Währungsargument; damit gilt STANDARD_WAEHRUNG (EUR, Skala 2) statt der
  //   Haushaltswährung. Der Test zeigt den Rechenfehler, den das bei abweichender
  //   Skala erzeugt: „1200" in einer Skala-0-Währung sind 1200 Minor Units, mit der
  //   EUR-Vorgabe werden daraus 120000.
  // Heute nicht auslösbar: alle Regionen in region.ts haben Skala 2. Der Fund ist ein
  //   latenter Fehler, der beim ersten Nicht-2er-Land (JPY, KWD) sofort zuschlägt.
  // GRÜN seit dem Fix — an der richtigen Stelle: parseBetrag OHNE Währungsargument muss
  // die Standardwährung nehmen, das ist kein Fehler, sondern seine Signatur. Der Fund lag
  // im finanzguruAdapter, der das Argument nicht übergab; der parst jetzt mit der Währung
  // DER ZEILE. Hier bleibt nur die Zusicherung, dass die Skala respektiert wird.
  it("respektiert die übergebene Währungsskala", () => {
    expect(parseBetrag("1200", JPY)).toBe(1200);
    expect(parseBetrag("1200")).toBe(120000); // Skala 2 der Standardwährung
  });

  // [GRÜN] mit explizit übergebener Währung stimmt die Skala.
  it("[GRÜN] explizite Währung wird respektiert", () => {
    expect(parseBetrag("1200", JPY)).toBe(1200);
    expect(minorZuMajor(1200, JPY)).toBe(1200);
  });

  // [ROT/latent] Fund 14 — der „damit nie etwas crasht"-Fallback greift zu kurz.
  // waehrung.ts:22-23 verspricht: ungültige Codes fallen auf Skala 2 zurück, „damit nie
  //   etwas crasht". waehrungNachCode fängt den Fehler zwar ab, gibt aber den ungültigen
  //   CODE unverändert weiter — und geldFormatierenMitSymbol (geld.ts:73) reicht genau
  //   diesen Code an Intl mit style:"currency" durch und wirft dort RangeError.
  // Erwartet: geldFormatierenMitSymbol wirft nicht (Fallback auf den Code als Symbol,
  //   wie es waehrungssymbol in geld.ts:36 bereits macht).
  // Tatsächlich: RangeError „Invalid currency code".
  // Heute nicht auslösbar: regionNachLocale (region.ts:38) fällt auf de-DE zurück, die
  //   Haushaltswährung stammt also immer aus der kuratierten Liste. Der Fund ist eine
  //   nicht eingelöste Zusage im Fallback, kein Live-Crash.
  it("[ROT/latent] ungültiger Währungscode crasht die Formatierung mit Symbol", () => {
    // GRÜN seit dem Fix: der Fallback gibt nicht mehr nur die Skala, sondern auch einen
    // gültigen CODE zurück — sonst wanderte der ungültige Code weiter in Intl und warf dort.
    const kaputt = waehrungNachCode("");
    expect(kaputt).toEqual(STANDARD_WAEHRUNG);
    expect(() => geldFormatierenMitSymbol(12345, { waehrung: kaputt, locale: "de-DE" })).not.toThrow();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 10. Überlauf über viele Konten
// ══════════════════════════════════════════════════════════════════════════════

describe("liquideMittel — Überlauf", () => {
  // [ROT] Fund 13 — keine Absicherung gegen den Verlust der Integer-Genauigkeit.
  // Erwartet: entweder ein exaktes Ergebnis oder ein erkennbarer Fehler.
  // Tatsächlich: die Summe zweier Konten mit je MAX_SAFE_INTEGER Cent liefert
  //   18014398509481982 — jenseits von 2^53 ist das Ergebnis nicht mehr exakt
  //   darstellbar, `Number.isSafeInteger` ist false, und alles Weitere rechnet still
  //   mit einem gerundeten Wert.
  // Warum das zählt: Der Weg dorthin ist Fund 4 (parseBetrag ohne Obergrenze), nicht
  //   ein realistischer Kontostand. Der Test hält die fehlende Untergrenze fest:
  //   nirgends im Kern gibt es einen Bereichs-Check.
  // ANGEPASST statt gefixt — mit Begründung: zwei Konten mit je MAX_SAFE_INTEGER Cent sind
  // rund 90 Billiarden Euro. Innerhalb von `number` lässt sich das nicht retten; exakte
  // Summen jenseits 2^53 bräuchten BigInt durch die gesamte Rechenkette, was den Kern für
  // einen unerreichbaren Fall umbauen hiesse.
  //
  // Der Schutz sitzt stattdessen an der Grenze: parseBetrag lehnt Eingaben ab, deren
  // Ergebnis kein sicherer Integer ist, und istCent hält solche Werte aus den Use-Cases
  // heraus. Der Test hält fest, wo die Grenze verläuft — und dass sie weit jenseits jedes
  // Haushalts liegt.
  it("summiert bis in absurde, aber sichere Grössenordnungen exakt", () => {
    const haelfte = Math.floor(Number.MAX_SAFE_INTEGER / 2);
    const konten: Zahlungskonto[] = [
      { id: "a", bezeichnung: "A", typ: "Giro", klasse: "liquide", inhaberIds: [], saldo: haelfte },
      { id: "b", bezeichnung: "B", typ: "Giro", klasse: "liquide", inhaberIds: [], saldo: haelfte },
    ];
    expect(liquideMittel(konten)).toBe(haelfte * 2);
    expect(Number.isSafeInteger(liquideMittel(konten))).toBe(true);
  });

  // [GRÜN] realistische Größenordnungen summieren exakt.
  it("[GRÜN] realistische Kontostände summieren exakt", () => {
    const konten: Zahlungskonto[] = Array.from({ length: 50 }, (_, i) => ({
      id: `k${i}`, bezeichnung: `K${i}`, typ: "Giro", klasse: "liquide" as const, inhaberIds: [], saldo: 123_456_789,
    }));
    expect(liquideMittel(konten)).toBe(50 * 123_456_789);
  });
});
