import { describe, expect, it } from "vitest";
import type { Zahlungsspur } from "../../core";
import { materialBefund } from "./trainingsmaterial";

function spur(over: Partial<Zahlungsspur> = {}): Zahlungsspur {
  return {
    id: "i1",
    datum: "2026-03-01",
    betrag: -1234,
    gegenpartei: "REWE Markt",
    verwendungszweck: "Einkauf",
    kategorieId: "kat-lebensmittel",
    charakter: "Aufwand",
    ...over,
  };
}

describe("Auswahl der Beispiele", () => {
  it("nimmt kategorisierte Aufwände und Erträge", () => {
    const b = materialBefund([spur(), spur({ id: "i2", betrag: 250000, charakter: "Ertrag", kategorieId: "kat-gehalt" })]);
    expect(b.beispiele).toHaveLength(2);
    expect(b.gesamt).toBe(2);
  });

  it("schließt Buchungen ohne Kategorie aus — da ist nichts zu lernen", () => {
    const b = materialBefund([spur({ kategorieId: undefined })]);
    expect(b.beispiele).toHaveLength(0);
    expect(b.ausgeschlossen.ohneKategorie).toBe(1);
  });

  it("schließt aufgeteilte Buchungen aus", () => {
    const b = materialBefund([spur({ geteilt: true })]);
    expect(b.ausgeschlossen.geteilt).toBe(1);
  });

  it("zählt eine geteilte Buchung ohne Kategorie als geteilt, nicht als kategorielos", () => {
    // Ein Split trägt seine Kategorien in den Teilen; „ohne Kategorie" läse sich, als
    // fehlte dort nur ein Eintrag.
    const b = materialBefund([spur({ geteilt: true, kategorieId: undefined })]);
    expect(b.ausgeschlossen.geteilt).toBe(1);
    expect(b.ausgeschlossen.ohneKategorie).toBe(0);
  });

  it("schließt Umschichtungen aus", () => {
    const b = materialBefund([spur({ charakter: "Umschichtung", kategorieId: undefined })]);
    expect(b.ausgeschlossen.umschichtung).toBe(1);
  });

  it("schließt Zeilen ohne jeden Text aus", () => {
    // Übrig bliebe nur „vz:-" — das Modell lernte daraus, dass jeder Abfluss dieselbe
    // Kategorie hat.
    const b = materialBefund([spur({ gegenpartei: "", verwendungszweck: "", glaeubigerId: undefined })]);
    expect(b.beispiele).toHaveLength(0);
    expect(b.ausgeschlossen.ohneText).toBe(1);
  });

  it("eine Zeile ohne jeden Text taugt nicht als Beispiel", () => {
    // Seit dem Wegfall des Vorzeichens gibt es hier gar kein Token mehr — vorher blieb
    // eines übrig und machte aus der Zeile ein scheinbares Beispiel.
    const b = materialBefund([spur({ gegenpartei: "", verwendungszweck: "" })]);
    expect(b.beispiele).toHaveLength(0);
    expect(b.ausgeschlossen.ohneText).toBe(1);
  });
});

describe("Was der Befund über die Daten sagt", () => {
  it("zählt die belegten Kategorien und meldet dünne", () => {
    const b = materialBefund([
      spur({ id: "a" }), spur({ id: "b" }), spur({ id: "c" }),
      spur({ id: "d", kategorieId: "kat-selten", gegenpartei: "Seltener Laden" }),
    ]);
    expect(b.kategorien).toBe(2);
    expect(b.duenneKategorien).toEqual([
      { kategorieId: "kat-selten", anzahl: 1 },
      { kategorieId: "kat-lebensmittel", anzahl: 3 },
    ]);
  });

  it("zählt Vokabular je Namensraum", () => {
    const b = materialBefund([spur()]);
    expect(b.vokabular.jeNamensraum.emp).toBeGreaterThan(0);
    expect(b.vokabular.jeNamensraum.vwz).toBe(1); // „einkauf"
    // Die beiden Namensräume ohne Wörter gibt es nicht mehr.
    expect(b.vokabular.jeNamensraum.gid).toBeUndefined();
    expect(b.vokabular.jeNamensraum.vz).toBeUndefined();
  });

  it("meldet die häufigsten Tokens absteigend, bei Gleichstand alphabetisch", () => {
    const b = materialBefund([spur({ id: "a" }), spur({ id: "b" }), spur({ id: "c", gegenpartei: "Anderer Laden" })]);
    // „vwz:einkauf" steht in allen drei Zeilen; darunter folgen die Empfänger-Tokens
    // mit je zwei Belegen, und unter ihnen entscheidet das Alphabet.
    expect(b.vokabular.merkmale.slice(0, 2).map((m) => [m.merkmal, m.belege])).toEqual([
      ["vwz:einkauf", 3],
      ["emp:markt", 2],
    ]);
  });

  it("zählt einmalige Tokens — das Maß für zu lasche Filter", () => {
    const b = materialBefund([spur({ verwendungszweck: "Sonderposten" })]);
    expect(b.vokabular.einmalige).toBeGreaterThan(0);
  });

  it("zählt verworfene Wörter nach Grund und nennt die häufigsten", () => {
    const b = materialBefund([
      spur({ id: "a", verwendungszweck: "SEPA Lastschrift RE2026004711" }),
      spur({ id: "b", verwendungszweck: "SEPA Lastschrift RE2026004712" }),
    ]);
    expect(b.vokabular.verworfen.ausgeschlossen).toBe(4); // 2× sepa, 2× lastschrift
    expect(b.vokabular.verworfen.ziffern).toBe(2);
    expect(b.vokabular.verworfeneWoerter[0]).toEqual({
      wort: "lastschrift", grund: "ausgeschlossen", herkunft: "vwz", anzahl: 2,
      // Das Wort steht unverändert auf der Liste — dass hier überhaupt eine Form steht,
      // ist der Unterschied zum Fall mit angeklebter Nummer (eigener Testfall unten).
      listenform: "lastschrift",
    });
  });

  it("zählt Verworfenes über dieselbe Grundmenge wie das Vokabular", () => {
    // Eine Zeile, die kein Beispiel wird, trägt auch nichts zur Statistik bei — sonst
    // ließen sich Vokabulargröße und Verwurfszahl nicht mehr gegeneinander lesen.
    const b = materialBefund([spur({ kategorieId: undefined, verwendungszweck: "SEPA Zahlung" })]);
    expect(b.beispiele).toHaveLength(0);
    expect(b.vokabular.verworfen.ausgeschlossen).toBe(0);
  });

  it("ein leerer Bestand liefert einen leeren, aber gültigen Befund", () => {
    const b = materialBefund([]);
    expect(b.gesamt).toBe(0);
    expect(b.beispiele).toHaveLength(0);
    expect(b.kategorien).toBe(0);
    expect(b.vokabular.groesse).toBe(0);
  });
});

describe("Was ein Merkmal taugt", () => {
  /**
   * Vier Beispiele, zwei Kategorien zu gleichen Teilen — die Gesamtunsicherheit ist damit
   * genau 1 Bit, und jede Trennkraft darunter liest sich als Anteil davon.
   */
  function bestand(): Zahlungsspur[] {
    return [
      spur({ id: "a1", gegenpartei: "Kesselmann", verwendungszweck: "Abschlag", kategorieId: "kat-a" }),
      spur({ id: "a2", gegenpartei: "Kesselmann", verwendungszweck: "Abschlag Sonderposten", kategorieId: "kat-a" }),
      spur({ id: "b1", gegenpartei: "Vibora", verwendungszweck: "Abschlag", kategorieId: "kat-b" }),
      spur({ id: "b2", gegenpartei: "Vibora", verwendungszweck: "Abschlag", kategorieId: "kat-b" }),
    ];
  }

  const nach = (b: ReturnType<typeof materialBefund>, merkmal: string) =>
    b.vokabular.merkmale.find((m) => m.merkmal === merkmal)!;

  it("misst die Deckung als Anteil der Beispiele", () => {
    const b = materialBefund(bestand());
    expect(nach(b, "emp=kesselmann").deckung).toBeCloseTo(0.5);
    expect(nach(b, "vwz:abschlag").deckung).toBeCloseTo(1);
  });

  it("gibt einem Merkmal, das seine Kategorie allein bestimmt, die volle Trennkraft", () => {
    const b = materialBefund(bestand());
    expect(nach(b, "emp=kesselmann").trennkraft).toBeCloseTo(1);
  });

  it("gibt einem Merkmal, das in jeder Zeile steht, keine Trennkraft", () => {
    // Es kommt überall vor und verteilt sich damit wie der Bestand selbst — es räumt
    // keine Unsicherheit weg, obwohl es das häufigste Token ist.
    const b = materialBefund(bestand());
    expect(nach(b, "vwz:abschlag").belege).toBe(4);
    expect(nach(b, "vwz:abschlag").trennkraft).toBeCloseTo(0);
  });

  it("trennt das seltene Merkmal vom starken, wo die Konzentration beide gleich aussehen lässt", () => {
    // Der Kern der Sache: „sonderposten" steht genau einmal und liegt damit zu 100 % in
    // einer Kategorie — dieselbe Konzentration wie beim Empfänger, der die halbe
    // Kategorie trägt. Nur die Trennkraft sieht den Unterschied.
    const b = materialBefund(bestand());
    const selten = nach(b, "vwz:sonderposten");
    const stark = nach(b, "emp=kesselmann");
    expect(selten.konzentration).toBeCloseTo(1);
    expect(stark.konzentration).toBeCloseTo(1);
    expect(selten.trennkraft).toBeLessThan(stark.trennkraft);
  });

  it("nennt die Verteilung über die Kategorien vollständig und absteigend", () => {
    const b = materialBefund([
      ...bestand(),
      spur({ id: "a3", gegenpartei: "Kesselmann", verwendungszweck: "Abschlag", kategorieId: "kat-c" }),
    ]);
    expect(nach(b, "emp=kesselmann").verteilung).toEqual([
      { kategorieId: "kat-a", anzahl: 2 },
      { kategorieId: "kat-c", anzahl: 1 },
    ]);
    expect(nach(b, "emp=kesselmann").kategorien).toBe(2);
  });

  it("liefert das Vokabular vollständig, nicht als Bestenliste", () => {
    // Vorher waren es fünfundzwanzig, und alles darunter war nicht erreichbar.
    const spuren = Array.from({ length: 40 }, (_, i) =>
      spur({ id: `s${i}`, gegenpartei: `Anbieter${i}`, verwendungszweck: `Posten${i}` }),
    );
    const b = materialBefund(spuren);
    expect(b.vokabular.merkmale).toHaveLength(b.vokabular.groesse);
    expect(b.vokabular.merkmale.length).toBeGreaterThan(25);
  });
});

describe("Zurückholen eines ausgeschlossenen Wortes", () => {
  it("nennt die Form, unter der das Wort auf der Liste steht — nicht die aus dem Auszug", () => {
    // Die Bank klebt die Nummer ans Wort; ausgeschlossen wurde der bereinigte Kern. Ein
    // „Zulassen" auf das Original löschte eine Zeile, die es nicht gibt — ohne Fehler
    // und ohne Wirkung.
    const b = materialBefund(
      [spur({ verwendungszweck: "Bankkarte2026 Zahlung" })],
      { herkuenfte: ["empGanz", "empWort", "vwz"], ausschluesse: [{ wort: "bankkarte" }] },
    );
    const eintrag = b.vokabular.verworfeneWoerter.find((v) => v.wort === "bankkarte2026")!;
    expect(eintrag.grund).toBe("ausgeschlossen");
    expect(eintrag.listenform).toBe("bankkarte");
  });
});
