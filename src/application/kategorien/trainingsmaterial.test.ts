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

  it("eine Zeile mit nur einer Gläubiger-ID trägt genug", () => {
    const b = materialBefund([spur({ gegenpartei: "", verwendungszweck: "", glaeubigerId: "DE98ZZZ0999" })]);
    expect(b.beispiele).toHaveLength(1);
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
    const b = materialBefund([spur({ glaeubigerId: "DE98ZZZ0999" })]);
    expect(b.vokabular.jeNamensraum.emp).toBeGreaterThan(0);
    expect(b.vokabular.jeNamensraum.vwz).toBe(1); // „einkauf"
    expect(b.vokabular.jeNamensraum.gid).toBe(1);
    expect(b.vokabular.jeNamensraum.vz).toBe(1);
  });

  it("meldet die häufigsten Tokens absteigend, bei Gleichstand alphabetisch", () => {
    const b = materialBefund([spur({ id: "a" }), spur({ id: "b" }), spur({ id: "c", gegenpartei: "Anderer Laden" })]);
    // „vwz:einkauf" und „vz:-" kommen beide 3× vor; der Gleichstand entscheidet sich
    // alphabetisch, damit die Anzeige zwischen zwei Läufen nicht springt.
    expect(b.vokabular.haeufigste.slice(0, 2).map((m) => [m.merkmal, m.belege])).toEqual([
      ["vwz:einkauf", 3],
      ["vz:-", 3],
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
    expect(b.vokabular.haeufigsteVerworfen[0]).toEqual({
      wort: "lastschrift", grund: "ausgeschlossen", herkunft: "vwz", anzahl: 2,
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
