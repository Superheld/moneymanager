import { describe, expect, it } from "vitest";
import {
  anbieterSchluessel,
  jahresbetrag,
  vertragskandidaten,
  type Zahlungsspur,
} from "./vertragErkennung";

const HEUTE = "2026-08-16";

let lauf = 0;
/** Eine Zahlungsreihe: `tage` Abstand, `n` Zahlungen, rückwärts ab `bis`. */
function reihe(opts: {
  name: string;
  betrag: number; // positiv, wird als Abfluss gebucht
  n: number;
  tage: number;
  bis?: string;
  glaeubigerId?: string;
  charakter?: Zahlungsspur["charakter"];
  streuung?: number[]; // Abweichung je Zahlung in Cent (zyklisch)
}): Zahlungsspur[] {
  const bis = Date.parse(opts.bis ?? HEUTE);
  const spuren: Zahlungsspur[] = [];
  for (let i = 0; i < opts.n; i++) {
    const tag = new Date(bis - i * opts.tage * 86_400_000).toISOString().slice(0, 10);
    const ab = opts.streuung?.length ? opts.streuung[i % opts.streuung.length] : 0;
    spuren.push({
      id: `s${lauf++}`,
      datum: tag,
      betrag: -(opts.betrag + ab),
      gegenpartei: opts.name,
      glaeubigerId: opts.glaeubigerId,
      charakter: opts.charakter ?? "Aufwand",
    });
  }
  return spuren;
}

/** Dieselbe Reihe als Zufluss: positiver Betrag, Charakter Ertrag. */
function zufluesse(opts: Parameters<typeof reihe>[0]): Zahlungsspur[] {
  return reihe(opts).map((s) => ({ ...s, betrag: -s.betrag, charakter: "Ertrag" as const }));
}

describe("anbieterSchluessel", () => {
  it("fasst dieselbe Firma trotz Rechtsform und Schreibweise zusammen", () => {
    expect(anbieterSchluessel("[anonymisiert] GmbH")).toBe(anbieterSchluessel("netcup"));
    expect(anbieterSchluessel("Müller & Söhne KG")).toBe(anbieterSchluessel("Mueller und Soehne"));
  });

  /**
   * Die Gegenprobe ist die wichtigere: ein FALSCH zusammengefasster Vorschlag („alle
   * [anonymisiert]") stiftet mehr Schaden als zwei getrennte, denn er nennt einen Betrag,
   * den es nie gab. Deshalb wird nicht auf die ersten Wörter gekürzt.
   */
  it("wirft verschiedene Anbieter mit gleichem Anfang NICHT zusammen", () => {
    expect(anbieterSchluessel("[anonymisiert] Bonn")).not.toBe(anbieterSchluessel("[anonymisiert] Bremen"));
  });
});

describe("vertragskandidaten", () => {
  it("erkennt eine monatliche Zahlung mit Rhythmus und Median-Betrag", () => {
    const k = vertragskandidaten(reihe({ name: "[anonymisiert]", betrag: 1650, n: 12, tage: 30 }), HEUTE);
    expect(k).toHaveLength(1);
    expect(k[0].anbieter).toBe("[anonymisiert]");
    expect(k[0].rhythmus).toBe("monatlich");
    expect(k[0].betrag).toBe(1650);
    expect(k[0].anzahl).toBe(12);
    expect(k[0].laeuft).toBe(true);
    expect(k[0].betragStabilitaet).toBe(1);
  });

  it("erkennt Quartal, Halbjahr und Jahr an ihren Abständen", () => {
    const spuren = [
      ...reihe({ name: "Rundfunk", betrag: 5508, n: 6, tage: 91 }),
      ...reihe({ name: "Verein", betrag: 18000, n: 4, tage: 365 }),
      ...reihe({ name: "Wartung", betrag: 2199, n: 4, tage: 182 }),
    ];
    const nach = new Map(vertragskandidaten(spuren, HEUTE).map((k) => [k.anbieter, k.rhythmus]));
    expect(nach.get("Rundfunk")).toBe("quartalsweise");
    expect(nach.get("Verein")).toBe("jaehrlich");
    expect(nach.get("Wartung")).toBe("halbjaehrlich");
  });

  /**
   * Der Fall, an dem eine naive Erkennung scheitert: ein Supermarkt wird oft besucht,
   * die Abstände schwanken aber wild. Der Median kann trotzdem zufällig bei 30 Tagen
   * landen — erst die Regelmäßigkeitsprüfung wirft ihn raus.
   */
  it("weist unregelmäßige Einkäufe ab, auch wenn der Median passt", () => {
    const tage = [2, 58, 3, 61, 4, 55, 30, 2, 59];
    let datum = Date.parse("2024-01-01");
    const spuren: Zahlungsspur[] = tage.map((t, i) => {
      datum += t * 86_400_000;
      return {
        id: `e${i}`,
        datum: new Date(datum).toISOString().slice(0, 10),
        betrag: -(1000 + i * 700),
        gegenpartei: "[anonymisiert]",
        charakter: "Aufwand" as const,
      };
    });
    expect(vertragskandidaten(spuren, HEUTE, { auchBeendete: true })).toHaveLength(0);
  });

  /**
   * Auf echten Daten stand das eigene Tagesgeldkonto als Vertragsvorschlag in der Liste:
   * eine monatliche Umbuchung ist perfekt regelmäßig — und trotzdem keine Ausgabe.
   */
  it("schlägt eine regelmäßige Umbuchung nicht als Vertrag vor", () => {
    const spuren = reihe({ name: "Tagesgeldkonto", betrag: 10000, n: 12, tage: 30, charakter: "Umschichtung" });
    expect(vertragskandidaten(spuren, HEUTE)).toHaveLength(0);
  });

  /**
   * Einnahmen sind der zweite Regelfall: kündbar ist ein Gehalt nicht, aber es ist der
   * größte Posten der Planung — von Hand abtippen wäre die teuerste Stelle.
   */
  it("erkennt eine regelmäßige Einnahme als Kandidat mit Charakter Ertrag", () => {
    const k = vertragskandidaten(zufluesse({ name: "Arbeitgeber", betrag: 250000, n: 12, tage: 30 }), HEUTE);
    expect(k).toHaveLength(1);
    expect(k[0].charakter).toBe("Ertrag");
    expect(k[0].betrag).toBe(250000);
    expect(k[0].rhythmus).toBe("monatlich");
  });

  /**
   * Derselbe Name in beiden Richtungen (Arbeitgeber, der auch Rechnungen stellt) darf
   * nicht in EINER Gruppe landen: die Abstände beider Reihen vermischt ergäben einen
   * Rhythmus, den es nie gab, und einen Betrag zwischen Gehalt und Rechnung.
   */
  it("trennt Ein- und Ausgaben desselben Anbieters", () => {
    const k = vertragskandidaten(
      [
        ...zufluesse({ name: "Arbeitgeber", betrag: 250000, n: 12, tage: 30 }),
        ...reihe({ name: "Arbeitgeber", betrag: 4500, n: 12, tage: 30 }),
      ],
      HEUTE,
    );
    expect(k).toHaveLength(2);
    expect(k.map((x) => x.charakter).sort()).toEqual(["Aufwand", "Ertrag"]);
    expect(new Set(k.map((x) => x.schluessel)).size).toBe(2);
    expect(k.find((x) => x.charakter === "Ertrag")!.betrag).toBe(250000);
    expect(k.find((x) => x.charakter === "Aufwand")!.betrag).toBe(4500);
  });

  /** Eine Rückerstattung auf einer Aufwandskategorie ist ein Zufluss, keine Ausgabe. */
  it("nimmt Zuflüsse mit Aufwands-Charakter nicht in die Ausgabenreihe", () => {
    const spuren = reihe({ name: "Versicherung", betrag: 3000, n: 12, tage: 30 }).map((s, i) =>
      i % 2 === 0 ? { ...s, betrag: -s.betrag } : s,
    );
    const k = vertragskandidaten(spuren, HEUTE, { auchBeendete: true });
    // Nur die sechs echten Abflüsse bleiben — und die liegen 60 Tage auseinander,
    // passen also zu keinem Rhythmus mehr.
    expect(k).toHaveLength(0);
  });

  it("merkt sich Konto und Kategorie der Zahlungen für die Vorbelegung", () => {
    const spuren = reihe({ name: "[anonymisiert]", betrag: 1650, n: 12, tage: 30 }).map((s, i) => ({
      ...s,
      kontoId: i === 0 ? "giro-zweit" : "giro", // ein Ausreißer kippt die Vorbelegung nicht
      kategorieId: "kat-it",
    }));
    const k = vertragskandidaten(spuren, HEUTE);
    expect(k[0].kontoId).toBe("giro");
    expect(k[0].kategorieId).toBe("kat-it");
  });

  it("gruppiert über die Gläubiger-ID, auch wenn der Name im Auszug wechselt", () => {
    const spuren = [
      ...reihe({ name: "O2", betrag: 3848, n: 6, tage: 30, glaeubigerId: "[anonymisiert]" }),
      ...reihe({ name: "Telefonica Germany GmbH", betrag: 3848, n: 6, tage: 30, bis: "2024-08-16", glaeubigerId: "[anonymisiert]" }),
    ];
    const k = vertragskandidaten(spuren, HEUTE);
    expect(k).toHaveLength(1);
    expect(k[0].anzahl).toBe(12);
    expect(k[0].glaeubigerId).toBe("[anonymisiert]");
  });

  it("meldet schwankende Beträge über die Stabilität, ohne den Vertrag zu verwerfen", () => {
    // Strom: Grundbetrag mit Nachzahlungen — Vertrag ja, fester Betrag nein.
    const k = vertragskandidaten(
      reihe({ name: "Stromanbieter", betrag: 5000, n: 12, tage: 30, streuung: [0, 4000, -1500, 8000] }),
      HEUTE,
    );
    expect(k).toHaveLength(1);
    expect(k[0].betragStabilitaet).toBeLessThan(0.5);
  });

  /**
   * Regression: `laeuft` rechnete zunächst über `ord`, das den Sortierschlüssel
   * YYYYMMDD liefert und keinen Tageszähler — „ord(heute) − 70" ergab ein Datum, das es
   * nicht gibt. Auf echten Daten fiel dadurch ein laufender Vertrag (letzte Zahlung vor
   * einem Monat) in die Rubrik „beendet".
   */
  it("hält einen Vertrag für laufend, dessen letzte Zahlung einen Monat her ist", () => {
    const k = vertragskandidaten(reihe({ name: "[anonymisiert]", betrag: 28730, n: 12, tage: 30, bis: "2026-07-15" }), HEUTE);
    expect(k).toHaveLength(1);
    expect(k[0].laeuft).toBe(true);
  });

  it("schlägt einen Vertrag nicht mehr vor, dessen letzte Zahlung zwei Jahre her ist", () => {
    const spuren = reihe({ name: "LBS", betrag: 10000, n: 12, tage: 30, bis: "2024-06-17" });
    expect(vertragskandidaten(spuren, HEUTE)).toHaveLength(0);
    const auch = vertragskandidaten(spuren, HEUTE, { auchBeendete: true });
    expect(auch).toHaveLength(1);
    expect(auch[0].laeuft).toBe(false);
    expect(auch[0].letzteZahlung).toBe("2024-06-17");
  });

  /** Zwei Abbuchungen am selben Tag ergäben einen Abstand von 0 und verzerrten den Median. */
  it("zählt zwei Buchungen am selben Tag als einen Termin", () => {
    const spuren = reihe({ name: "Doppel", betrag: 2000, n: 8, tage: 30 });
    const k = vertragskandidaten([...spuren, { ...spuren[0], id: "extra" }], HEUTE);
    expect(k).toHaveLength(1);
    expect(k[0].rhythmus).toBe("monatlich");
    expect(k[0].anzahl).toBe(9); // die Buchung zählt mit …
    expect(k[0].ersteZahlung).toBe(spuren[spuren.length - 1].datum); // … der Termin nicht doppelt
  });

  it("sortiert nach Jahreskosten, nicht nach Einzelbetrag", () => {
    const k = vertragskandidaten(
      [
        ...reihe({ name: "Jahresbeitrag", betrag: 18000, n: 4, tage: 365 }),
        ...reihe({ name: "Miete", betrag: 47141, n: 12, tage: 30 }),
        ...reihe({ name: "Handy", betrag: 3848, n: 12, tage: 30 }),
      ],
      HEUTE,
    );
    expect(k.map((x) => x.anbieter)).toEqual(["Miete", "Handy", "Jahresbeitrag"]);
    expect(jahresbetrag(k[0])).toBe(47141 * 12);
  });

  it("braucht mindestens drei Zahlungen — zwei sind kein Muster", () => {
    expect(vertragskandidaten(reihe({ name: "Einmalig", betrag: 5000, n: 2, tage: 30 }), HEUTE)).toHaveLength(0);
    expect(vertragskandidaten(reihe({ name: "Dreimal", betrag: 5000, n: 3, tage: 30 }), HEUTE)).toHaveLength(1);
  });

  it("kommt mit leerer Eingabe und namenlosen Buchungen zurecht", () => {
    expect(vertragskandidaten([], HEUTE)).toEqual([]);
    const ohneNamen = reihe({ name: "", betrag: 1000, n: 6, tage: 30 });
    expect(vertragskandidaten(ohneNamen, HEUTE)).toEqual([]);
  });
});
