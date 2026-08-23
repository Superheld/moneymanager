import { describe, expect, it } from "vitest";
import { HANSEATIC_QUELLE, betragZuCent, zuImportErgebnis, zuRohUmsatz } from "./uebersetzung";
import type { Account, Transaction } from "../../vendor/hanseatic-bank/types.js";

/** Eine gebuchte Kartenzahlung; die Felder je Testfall überschreiben. */
function buchung(ueber: Partial<Transaction> = {}): Transaction {
  return {
    type: "card",
    bookingDate: "2026-03-11",
    purchaseDate: "2026-03-05",
    amount: -12.34,
    currency: "EUR",
    direction: "debit",
    description: "Zahlung",
    booked: true,
    ...ueber,
  };
}

describe("betragZuCent — Euro als Fliesskomma ist die einzige verbliebene Falle", () => {
  it("rechnet in Minor Units um", () => {
    expect(betragZuCent(-12.34)).toBe(-1234);
    expect(betragZuCent(99.5)).toBe(9950);
    expect(betragZuCent(0)).toBe(0);
  });

  // -12.34 * 100 ist in IEEE 754 nicht exakt. Wer naiv multipliziert und trunkiert,
  // landet bei -1233 — einmal in vielen Zeilen, lautlos.
  //
  // Kein Halb-Cent-Fall darunter, und das ist Absicht: „1,005" gibt es als Fliesskomma
  // gar nicht, der nächste darstellbare Wert liegt knapp DARUNTER und rundet deshalb
  // korrekt ab. Ein Test darauf prüfte nicht die Umrechnung, sondern die Binärdarstellung
  // — und die Bank liefert ohnehin nur zwei Nachkommastellen.
  it("verliert am Fliesskomma-Rest keinen Cent", () => {
    expect(betragZuCent(-102.55)).toBe(-10255);
    expect(betragZuCent(-0.07)).toBe(-7);
    expect(betragZuCent(29.99)).toBe(2999);
    expect(betragZuCent(-1234.56)).toBe(-123456);
  });

  it("wirft lieber, als etwas Unsicheres durchzulassen", () => {
    expect(() => betragZuCent(Number.NaN)).toThrow();
    expect(() => betragZuCent(Number.POSITIVE_INFINITY)).toThrow();
  });
});

describe("zuRohUmsatz", () => {
  it("nimmt das Buchungsdatum als Buchungstag und den Kauftag als Valuta", () => {
    const r = zuRohUmsatz(buchung());
    expect(r.buchungstag).toBe("2026-03-11");
    expect(r.valuta).toBe("2026-03-05");
  });

  it("übernimmt das Vorzeichen der Bank, statt es abzuleiten", () => {
    // Die Bank liefert die Tilgung positiv und den Kartenumsatz negativ. Eine eigene
    // Ableitung über die Buchungsart läge beim nächsten neuen Schlüssel still falsch.
    expect(zuRohUmsatz(buchung({ amount: -12.34 })).betrag).toBe(-1234);
    expect(zuRohUmsatz(buchung({ type: "directDebit", amount: 250 })).betrag).toBe(25000);
  });

  it("nimmt den Händler als Gegenpartei, wenn es einen gibt", () => {
    const r = zuRohUmsatz(buchung({ merchant: { name: "Vibora" }, description: "Kartenzahlung" }));
    expect(r.gegenpartei).toBe("Vibora");
    expect(r.verwendungszweck).toBe("Kartenzahlung");
  });

  // Lastschriften und Überweisungen haben kein Händlerfeld. Bliebe die Gegenpartei leer,
  // verlöre die Kategorie-Erkennung gerade bei den wiederkehrenden Buchungen ihre Grundlage.
  it("fällt ohne Händler auf den Beschreibungstext zurück", () => {
    const r = zuRohUmsatz(buchung({ type: "transfer", merchant: undefined, description: "Ohlert" }));
    expect(r.gegenpartei).toBe("Ohlert");
  });

  it("behandelt ein leeres Händlerfeld wie gar keines", () => {
    const r = zuRohUmsatz(buchung({ merchant: { name: "   " }, description: "Kesselmann" }));
    expect(r.gegenpartei).toBe("Kesselmann");
  });

  it("übernimmt eine Kennung nur, wenn wirklich eine da ist", () => {
    expect(zuRohUmsatz(buchung({ id: "abc" })).nativeId).toBe("abc");
    // Leeres Feld bei Lastschrift/Überweisung: ein leerer String sähe aus wie ein Wert
    // und wäre bei jeder solchen Buchung derselbe.
    expect(zuRohUmsatz(buchung({ id: "" })).nativeId).toBeUndefined();
    expect(zuRohUmsatz(buchung({ id: "  " })).nativeId).toBeUndefined();
    expect(zuRohUmsatz(buchung({})).nativeId).toBeUndefined();
  });

  it("reicht die Buchungsart der Quelle unverändert durch", () => {
    expect(zuRohUmsatz(buchung({ type: "directDebit" })).umsatzart).toBe("directDebit");
    expect(zuRohUmsatz(buchung()).quelle).toBe(HANSEATIC_QUELLE);
  });

  it("nimmt den Kategorie-Hinweis der Bank mit, wenn einer dabei ist", () => {
    const mit = zuRohUmsatz(buchung({ merchant: { name: "Vibora", category: "grocery" } }));
    expect(mit.kategorieHinweis).toBe("grocery");
    expect(zuRohUmsatz(buchung()).kategorieHinweis).toBeUndefined();
  });

  it("hängt Konto-IBAN und -Name an, wenn das Konto bekannt ist", () => {
    const konto: Account = {
      id: "1234567890", // privacy-ok — erfundener Testwert
      holder: "Test Person",
      iban: "DE00000000000000000000", // privacy-ok — erfundener Testwert
      productLabel: "Testkarte",
      balance: -100,
      currency: "EUR",
    };
    const r = zuRohUmsatz(buchung(), konto);
    expect(r.kontoIban).toBe("DE00000000000000000000"); // privacy-ok — erfundener Testwert
    expect(r.kontoName).toBe("Testkarte");
  });

  // Diese Bank kennt unsere Konten nicht — was Umbuchung ist, entscheidet der Abgleich.
  it("markiert nichts von sich aus als Umbuchung", () => {
    expect(zuRohUmsatz(buchung({ type: "directDebit" })).istUmbuchung).toBe(false);
  });
});

describe("zuImportErgebnis", () => {
  it("übersetzt alle gebuchten Zeilen", () => {
    const e = zuImportErgebnis([buchung({ id: "a" }), buchung({ id: "b" })]);
    expect(e.umsaetze.length).toBe(2);
    expect(e.warnungen).toEqual([]);
    expect(e.quelle).toBe(HANSEATIC_QUELLE);
  });

  // Der eigentliche Punkt: eine Vormerkung kippt noch und bekommt beim Buchen eine andere
  // Kennung. Importiert man sie, steht dieselbe Zahlung nach dem nächsten Abruf zweimal da.
  it("lässt Vormerkungen aus, meldet sie aber", () => {
    const e = zuImportErgebnis([buchung({ id: "a" }), buchung({ booked: false, id: "b" })]);
    expect(e.umsaetze.length).toBe(1);
    expect(e.umsaetze[0]?.nativeId).toBe("a");
    expect(e.warnungen.length).toBe(1);
    expect(e.warnungen[0]).toMatch(/Vormerkung/);
  });

  it("zählt mehrere Vormerkungen in einer Meldung zusammen", () => {
    const e = zuImportErgebnis([
      buchung({ booked: false }),
      buchung({ booked: false }),
      buchung({ booked: false }),
    ]);
    expect(e.umsaetze).toEqual([]);
    expect(e.warnungen.length).toBe(1);
    expect(e.warnungen[0]).toMatch(/^3 Vormerkungen/);
  });

  // Dieselbe Regel wie bei den Datei-Importen: eine kaputte Zeile darf nicht den
  // ganzen Abruf verwerfen — der Nutzer soll das Gesamtbild sehen.
  it("überspringt eine kaputte Zeile, statt den Abruf zu verlieren", () => {
    const e = zuImportErgebnis([
      buchung({ id: "gut" }),
      buchung({ amount: Number.NaN, bookingDate: "2026-03-09" }),
      buchung({ id: "auch gut" }),
    ]);
    expect(e.umsaetze.length).toBe(2);
    expect(e.warnungen.length).toBe(1);
    expect(e.warnungen[0]).toMatch(/2026-03-09/);
  });

  // Diese Bank vergibt Buchungsdaten, die in der Zukunft liegen. Die Zeile wird
  // uebernommen — die Bank fuehrt sie bereits im Saldo, und wer sie weglaesst, erzeugt
  // eine Differenz, die niemand erklaeren kann. Sichtbar gemacht wird sie trotzdem.
  it("uebernimmt eine Buchung mit Datum in der Zukunft und weist darauf hin", () => {
    const e = zuImportErgebnis([buchung({ bookingDate: "2026-03-25" })], undefined, "2026-03-20");
    expect(e.umsaetze).toHaveLength(1);
    expect(e.umsaetze[0]?.buchungstag).toBe("2026-03-25");
    expect(e.warnungen.join(" ")).toMatch(/Zukunft/);
  });

  it("schweigt, wenn keine Buchung in der Zukunft liegt", () => {
    const e = zuImportErgebnis([buchung({ bookingDate: "2026-03-11" })], undefined, "2026-03-20");
    expect(e.warnungen).toEqual([]);
  });

  // Ohne Stichtag gibt es nichts zu vergleichen — dann schweigt sie ebenfalls, statt zu raten.
  it("meldet nichts, wenn kein Stichtag mitkommt", () => {
    const e = zuImportErgebnis([buchung({ bookingDate: "2099-01-01" })]);
    expect(e.umsaetze).toHaveLength(1);
    expect(e.warnungen).toEqual([]);
  });

  it("kommt mit einem leeren Abruf zurecht", () => {
    const e = zuImportErgebnis([]);
    expect(e.umsaetze).toEqual([]);
    expect(e.warnungen).toEqual([]);
  });
});
