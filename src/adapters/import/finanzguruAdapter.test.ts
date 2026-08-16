import { describe, expect, it } from "vitest";
import { finanzguruAdapter } from "./finanzguruAdapter";
import { xlsxAusZeilen } from "../../test/xlsxBauen";

// Echte Kopfzeile des Finanzguru-Exports (alle Spalten, Reihenfolge wie in der Datei).
const KOPF = [
  "Buchungstag", "Referenzkonto", "Name Referenzkonto", "Betrag", "Kontostand", "Waehrung",
  "Beguenstigter/Auftraggeber", "IBAN Beguenstigter/Auftraggeber", "Verwendungszweck", "E-Ref",
  "Mandatsreferenz", "Glaeubiger-ID", "Analyse-Hauptkategorie", "Analyse-Unterkategorie",
  "Analyse-Vertrag", "Analyse-Vertragsturnus", "Analyse-Vertrags-ID", "Analyse-Umbuchung",
  "Analyse-Vom frei verfuegbaren Einkommen ausgeschlossen", "Analyse-Umsatzart", "Analyse-Betrag",
  "Analyse-Woche", "Analyse-Monat", "Analyse-Quartal", "Analyse-Jahr", "Buchungs-ID",
  "Referenz-Original-ID", "Split-Typ",
];

// Excel-Seriennummern der im Test verwendeten Tage (Bezug: 1899-12-30, 1900-System).
const TAG = {
  "2021-11-01": "44501",
  "2022-02-28": "44620",
  "2022-03-03": "44623",
  "2022-04-04": "44655",
  "2022-05-01": "44682",
} as const;

/** Reihe mit nur den fürs Mapping relevanten Spalten gefüllt, Rest leer. */
function reihe(opts: {
  tag?: string; konto?: string; betrag?: string; waehrung?: string;
  gegenpartei?: string; gegenIban?: string; zweck?: string; glaeubiger?: string;
  unterkat?: string; umbuchung?: string; buchungsId?: string; splitTyp?: string;
  originalId?: string;
}): string[] {
  const f = (s = "") => s;
  return [
    f(opts.tag), f(opts.konto), "Girokonto", f(opts.betrag), "63.09", f(opts.waehrung ?? "EUR"),
    f(opts.gegenpartei), f(opts.gegenIban), f(opts.zweck), "", "", f(opts.glaeubiger),
    "Essen & Trinken", f(opts.unterkat), "nein", "", "", f(opts.umbuchung ?? "nein"), "nein", "Kartenzahlung",
    "Ausgaben", "2021-45", "2021-11", "2021-Q4", "2021", f(opts.buchungsId), f(opts.originalId), f(opts.splitTyp),
  ];
}

function datei(...reihen: string[][]): Uint8Array {
  return xlsxAusZeilen([KOPF, ...reihen]);
}

describe("finanzguruAdapter.erkennt", () => {
  it("erkennt einen Finanzguru-Export am Kopfzeilen-Fingerabdruck", () => {
    expect(finanzguruAdapter.erkennt(datei(reihe({ tag: TAG["2021-11-01"], betrag: "-6.55" })))).toBe(true);
  });

  it("erkennt fremde Inhalte nicht", () => {
    // Eine gültige xlsx mit anderen Spalten …
    expect(finanzguruAdapter.erkennt(xlsxAusZeilen([["Datum", "Umsatz"], ["1", "2"]]))).toBe(false);
    // … und alles, was gar keine xlsx ist (früher der CSV-Weg).
    expect(finanzguruAdapter.erkennt(new TextEncoder().encode("Buchungstag;Betrag\n1;2"))).toBe(false);
  });
});

describe("finanzguruAdapter.lies", () => {
  it("parst eine Zeile vollständig", () => {
    const { umsaetze, warnungen } = finanzguruAdapter.lies(
      datei(reihe({
        tag: TAG["2021-11-01"], konto: "DE02120300000000202051", betrag: "-6.55",
        gegenpartei: "Trinkgut", zweck: "Kartenzahlung", unterkat: "Lebensmittel",
        buchungsId: "2da83348289587cbe750f887563fd417135d354e",
      })),
    );
    expect(warnungen).toHaveLength(0);
    expect(umsaetze).toHaveLength(1);
    expect(umsaetze[0]).toEqual({
      buchungstag: "2021-11-01", // aus der Seriennummer 44501
      betrag: -655,
      waehrung: "EUR",
      gegenpartei: "Trinkgut",
      gegenparteiIban: undefined,
      verwendungszweck: "Kartenzahlung",
      kontoIban: "DE02120300000000202051",
      kontoName: "Girokonto",
      glaeubigerId: undefined,
      istUmbuchung: false,
      quelle: "finanzguru",
      nativeId: "2da83348289587cbe750f887563fd417135d354e",
      kategorieHinweis: "Lebensmittel",
    });
  });

  /**
   * Excel schreibt „5,30 €" als `-5.3` — eine Nachkommastelle, nicht zwei. Wer das als
   * 5,03 läse, verschöbe jeden runden Zehner-Cent-Betrag im ganzen Import.
   */
  it("liest eine einstellige Nachkommastelle als Zehntel, nicht als Hundertstel", () => {
    const { umsaetze } = finanzguruAdapter.lies(
      datei(reihe({ tag: TAG["2021-11-01"], betrag: "-5.3", gegenpartei: "Denn's" })),
    );
    expect(umsaetze[0].betrag).toBe(-530);
  });

  it("liest positive Beträge und die Gläubiger-ID", () => {
    const { umsaetze } = finanzguruAdapter.lies(
      datei(reihe({ tag: TAG["2022-02-28"], betrag: "2500.00", gegenpartei: "Arbeitgeber GmbH", glaeubiger: "DE98ZZZ09999999999" })),
    );
    expect(umsaetze[0].betrag).toBe(250000);
    expect(umsaetze[0].buchungstag).toBe("2022-02-28");
    expect(umsaetze[0].glaeubigerId).toBe("DE98ZZZ09999999999");
  });

  /** In einer Zelle ist ein Semikolon einfach ein Zeichen — der alte CSV-Fallstrick entfällt. */
  it("verträgt ein Semikolon im Verwendungszweck", () => {
    const { umsaetze } = finanzguruAdapter.lies(
      datei(reihe({ tag: TAG["2022-03-03"], betrag: "-12.00", gegenpartei: "Shop", zweck: "Artikel A; Artikel B" })),
    );
    expect(umsaetze).toHaveLength(1);
    expect(umsaetze[0].verwendungszweck).toBe("Artikel A; Artikel B");
    expect(umsaetze[0].betrag).toBe(-1200);
  });

  /** Rückfall: Excel kann ein Datum auch als Text ablegen, dann kommt keine Serie an. */
  it("nimmt ein Datum auch in Textform", () => {
    const { umsaetze } = finanzguruAdapter.lies(
      datei(reihe({ tag: "01.11.2021", betrag: "-6.55", gegenpartei: "Trinkgut" })),
    );
    expect(umsaetze[0].buchungstag).toBe("2021-11-01");
  });

  it("überspringt Zeilen mit kaputtem Betrag/Datum und sammelt Warnungen statt zu werfen", () => {
    const { umsaetze, warnungen } = finanzguruAdapter.lies(
      datei(
        reihe({ tag: TAG["2021-11-01"], betrag: "-6.55", gegenpartei: "Gut" }),
        reihe({ tag: TAG["2021-11-01"], betrag: "", gegenpartei: "KeinBetrag" }),
        reihe({ tag: "kaputt", betrag: "-1.00", gegenpartei: "KeinDatum" }),
      ),
    );
    expect(umsaetze).toHaveLength(1);
    expect(umsaetze[0].gegenpartei).toBe("Gut");
    expect(warnungen.some((w) => w.includes("Betrag"))).toBe(true);
    expect(warnungen.some((w) => w.includes("Datum"))).toBe(true);
  });

  it("erkennt interne Umbuchungen (Analyse-Umbuchung = ja)", () => {
    const { umsaetze } = finanzguruAdapter.lies(
      datei(
        reihe({ tag: TAG["2022-05-01"], betrag: "-500.00", gegenpartei: "Eigenes Tagesgeld", umbuchung: "ja" }),
        reihe({ tag: TAG["2022-05-01"], betrag: "-6.55", gegenpartei: "Trinkgut" }),
      ),
    );
    expect(umsaetze[0].istUmbuchung).toBe(true);
    expect(umsaetze[1].istUmbuchung).toBe(false);
  });

  /**
   * Finanzguru liefert eine gesplittete Buchung DOPPELT: einmal als Original mit dem
   * vollen Betrag und einmal zerlegt in „Teilbuchung" + „Restbetrag". In der echten
   * Datei waren das 78 Teile zu 38 Originalen — wer alles importiert, zählt jeden
   * gesplitteten Umsatz zweimal (dort: 3.568,17 € zu viel).
   */
  it("überspringt Teile einer Split-Buchung, deren Original in der Datei steht", () => {
    const { umsaetze, warnungen } = finanzguruAdapter.lies(
      datei(
        reihe({ tag: TAG["2022-04-04"], betrag: "-123.75", gegenpartei: "Bluetomato", buchungsId: "orig-1", splitTyp: "Original" }),
        reihe({ tag: TAG["2022-04-04"], betrag: "-49.95", gegenpartei: "Bluetomato", buchungsId: "teil-1", splitTyp: "Teilbuchung", originalId: "orig-1" }),
        reihe({ tag: TAG["2022-04-04"], betrag: "-73.80", gegenpartei: "Bluetomato", buchungsId: "teil-2", splitTyp: "Restbetrag", originalId: "orig-1" }),
      ),
    );
    expect(umsaetze).toHaveLength(1);
    expect(umsaetze[0].nativeId).toBe("orig-1");
    expect(umsaetze[0].betrag).toBe(-12375); // der Betrag, der wirklich vom Konto ging
    expect(warnungen.some((w) => w.includes("übersprungen"))).toBe(true);
  });

  /**
   * Gegenprobe: bei einem Export mit Zeitraumfilter kann das Original fehlen. Dann wäre
   * ein stiller Verlust schlimmer als eine doppelte Zeile — der Teil wird übernommen und
   * die Lage gemeldet.
   */
  it("übernimmt einen Teil, dessen Original nicht in der Datei steht", () => {
    const { umsaetze, warnungen } = finanzguruAdapter.lies(
      datei(reihe({ tag: TAG["2022-04-04"], betrag: "-49.95", gegenpartei: "Bluetomato", buchungsId: "teil-1", splitTyp: "Teilbuchung", originalId: "fehlt" })),
    );
    expect(umsaetze).toHaveLength(1);
    expect(warnungen.some((w) => w.includes("ohne zugehörige"))).toBe(true);
  });

  it("lässt eine Original-Zeile unangetastet, auch wenn sie als Split markiert ist", () => {
    const { umsaetze } = finanzguruAdapter.lies(
      datei(reihe({ tag: TAG["2022-04-04"], betrag: "-50.00", gegenpartei: "Amazon", buchungsId: "orig-2", splitTyp: "Original" })),
    );
    expect(umsaetze).toHaveLength(1);
    expect(umsaetze[0].betrag).toBe(-5000);
  });

  it("meldet eine Datei ohne Kopfzeile, statt still nichts zu liefern", () => {
    const { umsaetze, warnungen } = finanzguruAdapter.lies(xlsxAusZeilen([["Datum", "Umsatz"], ["1", "2"]]));
    expect(umsaetze).toHaveLength(0);
    expect(warnungen.some((w) => w.includes("Kopfzeile"))).toBe(true);
  });

  it("meldet eine Datei, die gar keine xlsx ist", () => {
    const { umsaetze, warnungen } = finanzguruAdapter.lies(new TextEncoder().encode("kein zip"));
    expect(umsaetze).toHaveLength(0);
    expect(warnungen.some((w) => w.includes("Excel"))).toBe(true);
  });
});
