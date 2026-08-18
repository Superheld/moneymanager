// Tests des Dublettenfinders.
//
// Die Textbeispiele sind der ECHTEN Form nachgebaut (Finanzguru hängt den
// Kartennummern-Block an, die Bank stellt den Buchungstext voran), die Inhalte selbst
// sind erfunden — das Repo ist öffentlich.

import { describe, expect, it } from "vitest";
import type { RohUmsatz } from "./rohUmsatz";
import { ordneZu, vergleiche, zweckKern, type Vergleichbar } from "./dublette";

function bank(over: Partial<RohUmsatz> = {}): RohUmsatz {
  return {
    buchungstag: "2026-08-04",
    valuta: "2026-08-04",
    betrag: -4990,
    waehrung: "EUR",
    gegenpartei: "EDK*[anonymisiert] [anonymisiert]",
    verwendungszweck: "KARTENVERFÜGUNGEDK*[anonymisiert] [anonymisiert], MUSTERSTADT  DE",
    kontoIban: "[entfernt]",
    istUmbuchung: false,
    quelle: "fints",
    ...over,
  };
}

function datei(over: Partial<RohUmsatz> = {}): RohUmsatz {
  return {
    buchungstag: "2026-08-04",
    betrag: -4990,
    waehrung: "EUR",
    gegenpartei: "[anonymisiert]",
    verwendungszweck: "EDK*[anonymisiert] [anonymisiert], MUSTERSTADT DEKarte Nr. 1234 56XX XXXX 7890",
    kontoIban: "[entfernt]",
    istUmbuchung: false,
    quelle: "finanzguru",
    nativeId: "fg-1",
    ...over,
  };
}

describe("zweckKern", () => {
  it("schneidet den Buchungstext ab, den nur die Bank mitliefert", () => {
    // Sonst scheitert der Vergleich an genau diesem Wort: die Datei kennt es nicht.
    expect(zweckKern("KARTENVERFÜGUNG[anonymisiert], MUSTERSTADT")).toBe("[anonymisiert]musterstadt");
    expect(zweckKern("[anonymisiert], Musterstadt")).toBe("[anonymisiert]musterstadt");
  });

  it("lässt einen unbekannten Anfang stehen, statt zu raten", () => {
    expect(zweckKern("SONDERFALL XY, MUSTERSTADT")).toBe("sonderfallxymusterstadt");
  });
});

describe("vergleiche", () => {
  it("erklärt zwei Buchungen mit verschiedenem Betrag NIE für dieselbe", () => {
    // Härteste Regel des Finders: kein Textvergleich schlägt den Betrag.
    const b = vergleiche(bank(), datei({ betrag: -4991 }));
    expect(b.urteil).toBe("verschieden");
  });

  it("erkennt den Reimport an der Buchungs-ID der Quelle", () => {
    // Der Fall „dieselbe Datei nochmal einlesen": keine Schätzung, sondern eine Zusage
    // der Quelle.
    const b = vergleiche(datei(), datei({ verwendungszweck: "ganz anderer Text", gegenpartei: "X" }));
    expect(b.urteil).toBe("identisch");
    expect(b.gruende).toContain("gleiche Buchungs-ID der Quelle");
  });

  it("erkennt dieselbe Lastschrift über Gläubiger-ID und Mandatsreferenz", () => {
    const a = bank({ glaeubigerId: "[anonymisiert]", mandatsreferenz: "M-4711", verwendungszweck: "" });
    const b = datei({ glaeubigerId: "[anonymisiert]", mandatsreferenz: "M-4711", nativeId: undefined, verwendungszweck: "" });
    expect(vergleiche(a, b).urteil).toBe("identisch");
  });

  it("erkennt Bank gegen Datei am Verwendungszweck — der eine ist Anfang des anderen", () => {
    // Der häufigste Fall im echten Bestand: derselbe Text, Finanzguru hängt den
    // Kartennummern-Block an, die Bank stellt den Buchungstext voran.
    const b = vergleiche(bank(), datei({ nativeId: undefined }));
    expect(b.urteil).toBe("identisch");
    expect(b.gruende).toContain("Verwendungszweck ist Anfang des anderen");
  });

  it("legt bei abweichendem Datum vor, statt zu entscheiden", () => {
    // Zwei gleiche Beträge beim selben Händler an aufeinanderfolgenden Tagen sind
    // entweder eine verschobene Buchung oder zwei Einkäufe. Das ist aus den Daten nicht
    // zu entscheiden — also fragen.
    const b = vergleiche(bank({ buchungstag: "2026-08-05", valuta: "2026-08-05" }), datei({ nativeId: undefined }));
    expect(b.urteil).toBe("verdacht");
    expect(b.gruende).toContain("Datum weicht ab — zur Bestätigung vorgelegt");
  });

  it("rettet den Abstand über die Valuta, wenn der Buchungstag verschoben wurde", () => {
    // Aus angekündigt wird gebucht: neuer Buchungstag, gleiche Wertstellung.
    const a = bank({ buchungstag: "2026-08-06", valuta: "2026-08-04" });
    const b = datei({ nativeId: undefined, buchungstag: "2026-08-04" });
    const urteil = vergleiche(a, b);
    expect(urteil.urteil).toBe("identisch");
    expect(urteil.gruende).toContain("gleicher Tag");
  });

  it("hält zwei verschiedene Zahlungen mit gleichem Betrag am gleichen Tag auseinander", () => {
    const a = bank({ gegenpartei: "TANKSTELLE NORD", verwendungszweck: "KARTENVERFÜGUNGTANKSTELLE NORD, MUSTERSTADT" });
    const b = datei({ nativeId: undefined, gegenpartei: "Blumenladen", verwendungszweck: "Blumenladen, Musterstadt" });
    expect(vergleiche(a, b).urteil).toBe("verschieden");
  });

  it("legt vor, wenn nur Tag und Betrag passen und sonst nichts bekannt ist", () => {
    // FinTS lässt die Gegenpartei bei jeder vierten Buchung leer; steht dann auch kein
    // Zweck da, bleibt genau ein schwaches Signal übrig.
    const a = bank({ gegenpartei: "", verwendungszweck: "" });
    const b = datei({ nativeId: undefined });
    expect(vergleiche(a, b).urteil).toBe("verdacht");
  });

  it("trennt Konten, auch wenn alles andere passt", () => {
    const b = vergleiche(bank(), datei({ nativeId: undefined, kontoIban: "[entfernt]" }));
    expect(b.urteil).toBe("verschieden");
  });

  it("nennt seine Gründe im Klartext", () => {
    // Eine Fehlentscheidung muss lesbar sein — das ist der Grund gegen ein Modell.
    expect(vergleiche(bank(), datei({ nativeId: undefined })).gruende.length).toBeGreaterThan(1);
  });
});

describe("ordneZu", () => {
  it("vergibt jede Bestandszeile höchstens einmal", () => {
    // Drei gleiche Beträge am selben Tag: ohne 1:1-Regel zeigten alle drei neuen auf
    // dieselbe alte Zeile, und zwei echte Buchungen verschwänden.
    const bestand: Vergleichbar[] = [datei({ nativeId: "a" }), datei({ nativeId: "b" })];
    const neue = [bank(), bank(), bank()];

    const treffer = ordneZu(neue, bestand);
    const zugeordnet = treffer.filter((t) => t.bestand).map((t) => t.bestand);
    expect(zugeordnet).toHaveLength(2);
    expect(new Set(zugeordnet).size).toBe(2);
    expect(treffer.filter((t) => !t.bestand)).toHaveLength(1);
  });

  it("nimmt den besten Treffer zuerst", () => {
    // Sonst frisst ein knapper Kandidat die Zeile, die eindeutig woanders hingehört.
    const passend = datei({ nativeId: "passend" });
    const schwach = datei({ nativeId: "schwach", gegenpartei: "Anderer Laden", verwendungszweck: "Anderer Laden, Musterstadt" });
    const treffer = ordneZu([bank()], [schwach, passend]);
    expect(treffer[0].bestand?.nativeId).toBe("passend");
  });

  it("lässt eine wirklich neue Buchung neu sein", () => {
    const treffer = ordneZu([bank({ betrag: -777, verwendungszweck: "NEUER LADEN", gegenpartei: "NEUER LADEN" })], [datei()]);
    expect(treffer[0].bestand).toBeUndefined();
    expect(treffer[0].bewertung.urteil).toBe("verschieden");
  });

  it("kommt mit leerem Bestand klar", () => {
    expect(ordneZu([bank()], [])).toHaveLength(1);
    expect(ordneZu([], [datei()])).toEqual([]);
  });
});
