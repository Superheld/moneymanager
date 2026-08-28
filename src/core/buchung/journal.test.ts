// Der Kern des Rückwegs: was unterscheidet sich, und welcher Stand gilt als Ursprung.
//
// Alle Werte hier sind erfunden.

import { describe, expect, it } from "vitest";
import { letzterStand, unterschiede, urzustand, type Journaleintrag } from "./journal";
import type { IstBuchung } from "./istbuchung";

function buchung(felder: Partial<IstBuchung> = {}): IstBuchung {
  return {
    id: "b1",
    datum: "2026-03-04",
    betrag: -1234,
    kontoId: "k1",
    charakter: "Aufwand",
    quelle: "import",
    ...felder,
  };
}

function eintrag(
  art: Journaleintrag["art"],
  zeitpunkt: string,
  vorher?: IstBuchung,
  nachher?: IstBuchung,
): Journaleintrag {
  return { id: art + zeitpunkt, istbuchungId: "b1", zeitpunkt, art, vorher, nachher };
}

describe("unterschiede", () => {
  it("meldet nichts, wenn zwei Stände gleich sind", () => {
    expect(unterschiede(buchung(), buchung())).toEqual([]);
  });

  it("nennt genau die geänderten Felder", () => {
    const a = buchung({ betrag: -1234, notiz: "Wocheneinkauf" });
    const b = buchung({ betrag: -4321, notiz: "Wocheneinkauf" });
    expect(unterschiede(a, b)).toEqual(["betrag"]);
  });

  it("hält fehlendes Feld und null für dasselbe", () => {
    // Die Datenbank speichert NULL, das Modell lässt das Feld weg. Ohne diese
    // Gleichsetzung meldete jede Buchung ohne Notiz einen Unterschied gegen sich selbst.
    const ohne = buchung();
    const leer = buchung({ notiz: undefined, kategorieId: undefined });
    expect(unterschiede(ohne, leer)).toEqual([]);
  });

  it("vergleicht Aufteilungen nach Inhalt, nicht nach Objektgleichheit", () => {
    const a = buchung({ betrag: -5000, aufteilungen: [{ kategorieId: "le", betrag: -5000 }] });
    const b = buchung({ betrag: -5000, aufteilungen: [{ kategorieId: "le", betrag: -5000 }] });
    expect(unterschiede(a, b)).toEqual([]);

    const c = buchung({ betrag: -5000, aufteilungen: [{ kategorieId: "dr", betrag: -5000 }] });
    expect(unterschiede(a, c)).toEqual(["aufteilungen"]);
  });

  it("sieht eine hinzugekommene Paarung", () => {
    const frei = buchung();
    const gepaart = buchung({ transferId: "t1", gegenkontoId: "k2", charakter: "Umschichtung" });
    expect(unterschiede(frei, gepaart).sort()).toEqual(["charakter", "gegenkontoId", "transferId"]);
  });

  it("übergeht Identität und Herkunft", () => {
    // `quelle` und `rohHash` sagen, WER die Zeile ist und woher sie kam. Stünden sie in
    // der Liste, wäre jede Anzeige um Zeilen länger, die nie etwas zeigen.
    const a = buchung({ rohHash: "abc" });
    const b = buchung({ rohHash: "xyz" });
    expect(unterschiede(a, b)).toEqual([]);
  });
});

describe("urzustand", () => {
  it("liefert den Stand aus dem Anlege-Eintrag", () => {
    const ur = buchung({ betrag: -1000 });
    const eintraege = [
      eintrag("angelegt", "2026-03-04T09:00:00.000Z", undefined, ur),
      eintrag("geaendert", "2026-03-05T09:00:00.000Z", ur, buchung({ betrag: -9999 })),
    ];
    expect(urzustand(eintraege)?.betrag).toBe(-1000);
  });

  it("nimmt den LETZTEN Anlege-Eintrag, wenn die Buchung ein zweites Leben hat", () => {
    // Der Rückweg aus dem Journal legt eine gelöschte Buchung unter derselben Id wieder
    // an. Der Eintrag davor gehört zum alten Leben und wäre als Rückfallstand falsch.
    const erstesLeben = buchung({ betrag: -1000 });
    const zweitesLeben = buchung({ betrag: -2000 });
    const eintraege = [
      eintrag("angelegt", "2026-03-01T09:00:00.000Z", undefined, erstesLeben),
      eintrag("geloescht", "2026-03-02T09:00:00.000Z", erstesLeben, undefined),
      eintrag("angelegt", "2026-03-03T09:00:00.000Z", undefined, zweitesLeben),
    ];
    expect(urzustand(eintraege)?.betrag).toBe(-2000);
  });

  it("liefert nichts, wenn es keinen Anlege-Eintrag gibt", () => {
    // Der Bestand vor Einführung des Journals. Kein Fehler, sondern die Auskunft
    // „von hier führt kein Weg zurück".
    const stand = buchung();
    expect(urzustand([eintrag("geaendert", "2026-03-05T09:00:00.000Z", stand, stand)])).toBeUndefined();
    expect(urzustand([])).toBeUndefined();
  });
});

describe("letzterStand", () => {
  it("liefert den Stand einer gelöschten Buchung", () => {
    const weg = buchung({ notiz: "Doppelt erfasst" });
    const eintraege = [
      eintrag("angelegt", "2026-03-01T09:00:00.000Z", undefined, weg),
      eintrag("geloescht", "2026-03-02T09:00:00.000Z", weg, undefined),
    ];
    expect(letzterStand(eintraege)?.notiz).toBe("Doppelt erfasst");
  });

  it("liefert nichts, solange die Buchung noch da ist", () => {
    const stand = buchung();
    expect(letzterStand([eintrag("angelegt", "2026-03-01T09:00:00.000Z", undefined, stand)])).toBeUndefined();
  });
});
