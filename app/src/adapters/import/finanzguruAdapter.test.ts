import { describe, expect, it } from "vitest";
import { finanzguruAdapter } from "./finanzguruAdapter";

// Echte Kopfzeile des Finanzguru-Exports (alle Spalten, Reihenfolge wie in der Datei).
const KOPF =
  "Buchungstag;Referenzkonto;Name Referenzkonto;Betrag;Kontostand;Waehrung;" +
  "Beguenstigter/Auftraggeber;IBAN Beguenstigter/Auftraggeber;Verwendungszweck;E-Ref;" +
  "Mandatsreferenz;Glaeubiger-ID;Analyse-Hauptkategorie;Analyse-Unterkategorie;" +
  "Analyse-Vertrag;Analyse-Vertragsturnus;Analyse-Vertrags-ID;Analyse-Umbuchung;" +
  "Analyse-Vom frei verfuegbaren Einkommen ausgeschlossen;Analyse-Umsatzart;Analyse-Betrag;" +
  "Analyse-Woche;Analyse-Monat;Analyse-Quartal;Analyse-Jahr;Buchungs-ID;Referenz-Original-ID;Split-Typ";

// Reihen mit nur den fürs Mapping relevanten Spalten gefüllt, Rest leer (Spaltenzahl muss passen).
function reihe(opts: {
  tag?: string; konto?: string; betrag?: string; waehrung?: string;
  gegenpartei?: string; gegenIban?: string; zweck?: string; glaeubiger?: string;
  unterkat?: string; buchungsId?: string; splitTyp?: string;
}): string {
  const f = (s = "") => s;
  return [
    f(opts.tag), f(opts.konto), "Girokonto", f(opts.betrag), "63,09", f(opts.waehrung ?? "EUR"),
    f(opts.gegenpartei), f(opts.gegenIban), f(opts.zweck), "", "", f(opts.glaeubiger),
    "Essen & Trinken", f(opts.unterkat), "nein", "", "", "nein", "nein", "Kartenzahlung",
    "Ausgaben", "2021-45", "2021-11", "2021-Q4", "2021", f(opts.buchungsId), "", f(opts.splitTyp),
  ].join(";");
}

function csv(...reihen: string[]): string {
  return ["Tabelle 1", KOPF, ...reihen].join("\n");
}

describe("finanzguruAdapter.erkennt", () => {
  it("erkennt einen Finanzguru-Export am Header-Fingerabdruck", () => {
    expect(finanzguruAdapter.erkennt(csv(reihe({ tag: "01.11.2021", betrag: "-6,55" })))).toBe(true);
  });

  it("erkennt fremde Inhalte nicht", () => {
    expect(finanzguruAdapter.erkennt('"Umsätze Girokonto";"Zeitraum: 30 Tage"')).toBe(false);
    expect(finanzguruAdapter.erkennt("irgendein;text;ohne;header")).toBe(false);
  });
});

describe("finanzguruAdapter.lies", () => {
  it("überspringt die Müll-Kopfzeile und parst eine Zeile vollständig", () => {
    const { umsaetze, warnungen } = finanzguruAdapter.lies(
      csv(reihe({
        tag: "01.11.2021", konto: "DE61200411440690602800", betrag: "-6,55",
        gegenpartei: "Trinkgut", zweck: "Kartenzahlung", unterkat: "Lebensmittel",
        buchungsId: "2da83348289587cbe750f887563fd417135d354e",
      })),
    );
    expect(warnungen).toHaveLength(0);
    expect(umsaetze).toHaveLength(1);
    expect(umsaetze[0]).toEqual({
      buchungstag: "2021-11-01",
      betrag: -655, // deutsches „-6,55" → Minor Units
      waehrung: "EUR",
      gegenpartei: "Trinkgut",
      gegenparteiIban: undefined,
      verwendungszweck: "Kartenzahlung",
      kontoIban: "DE61200411440690602800",
      glaeubigerId: undefined,
      quelle: "finanzguru",
      nativeId: "2da83348289587cbe750f887563fd417135d354e",
      kategorieHinweis: "Lebensmittel",
    });
  });

  it("liest positive Beträge und die Gläubiger-ID", () => {
    const { umsaetze } = finanzguruAdapter.lies(
      csv(reihe({ tag: "28.02.2022", betrag: "2.500,00", gegenpartei: "Arbeitgeber GmbH", glaeubiger: "DE98ZZZ09999999999" })),
    );
    expect(umsaetze[0].betrag).toBe(250000);
    expect(umsaetze[0].glaeubigerId).toBe("DE98ZZZ09999999999");
  });

  it("verträgt ein Semikolon im gequoteten Verwendungszweck (kein Spaltenversatz)", () => {
    const { umsaetze } = finanzguruAdapter.lies(
      csv(reihe({ tag: "03.03.2022", betrag: "-12,00", gegenpartei: "Shop", zweck: '"Artikel A; Artikel B"' })),
    );
    expect(umsaetze).toHaveLength(1);
    expect(umsaetze[0].verwendungszweck).toBe("Artikel A; Artikel B");
    expect(umsaetze[0].betrag).toBe(-1200);
  });

  it("überspringt Zeilen mit kaputtem Betrag/Datum und sammelt Warnungen statt zu werfen", () => {
    const { umsaetze, warnungen } = finanzguruAdapter.lies(
      csv(
        reihe({ tag: "01.11.2021", betrag: "-6,55", gegenpartei: "Gut" }),
        reihe({ tag: "01.11.2021", betrag: "", gegenpartei: "KeinBetrag" }),
        reihe({ tag: "kaputt", betrag: "-1,00", gegenpartei: "KeinDatum" }),
      ),
    );
    expect(umsaetze).toHaveLength(1);
    expect(umsaetze[0].gegenpartei).toBe("Gut");
    expect(warnungen.some((w) => w.includes("Betrag"))).toBe(true);
    expect(warnungen.some((w) => w.includes("Datum"))).toBe(true);
  });

  it("warnt vor Split-Buchungen, parst sie aber (Mehrfachzählung folgt in Slice 2)", () => {
    const { umsaetze, warnungen } = finanzguruAdapter.lies(
      csv(reihe({ tag: "04.04.2022", betrag: "-50,00", gegenpartei: "Amazon", splitTyp: "Teilbuchung" })),
    );
    expect(umsaetze).toHaveLength(1);
    expect(warnungen.some((w) => w.includes("Split"))).toBe(true);
  });
});
