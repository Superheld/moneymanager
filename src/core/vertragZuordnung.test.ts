// Vertragszuordnung — Regel trifft Zahlung, und was der Abgleich daraus macht.
//
// Der teure Fehler ist hier nicht „findet nichts", sondern „findet zu viel": ein Vertrag,
// dessen Regel jede Zahlung an denselben Empfänger einsammelt, verfälscht später jede
// Auswertung, die auf der Zuordnung aufbaut. Der zweite ist „Handarbeit verschwindet" —
// beides steht unten als eigener Fall.

import { describe, expect, it } from "vitest";
import {
  passtZu,
  standardErkennung,
  vertragFuer,
  zuordnungAbgleich,
  type Vertragserkennung,
  type Vertragszuordnung,
} from "./vertragZuordnung";
import type { Zahlungsspur } from "./vertragErkennung";

function spur(teil: Partial<Zahlungsspur> = {}): Zahlungsspur {
  return {
    id: "b1",
    datum: "2026-05-10",
    betrag: -1650,
    gegenpartei: "Netcup GmbH",
    kategorieId: "hosting",
    kontoId: "k1",
    charakter: "Aufwand",
    ...teil,
  };
}

const netcup: Vertragserkennung = { vertragId: "v1", schluessel: ["netcup"] };

describe("passtZu", () => {
  it("trifft über den normalisierten Namen, Rechtsform und Schreibweise egal", () => {
    expect(passtZu(netcup, spur({ gegenpartei: "NETCUP GmbH" }))).toBe(true);
    expect(passtZu(netcup, spur({ gegenpartei: "netcup" }))).toBe(true);
  });

  it("trifft über die Gläubiger-ID, auch wenn der Name anders lautet", () => {
    const e: Vertragserkennung = { vertragId: "v1", schluessel: ["DE98ZZZ09999999999"] };
    expect(passtZu(e, spur({ gegenpartei: "Irgendein Rechenzentrum", glaeubigerId: "DE98ZZZ09999999999" }))).toBe(true);
  });

  it("lässt Umschichtungen draußen", () => {
    // Eine monatliche Umbuchung aufs eigene Tagesgeldkonto ist perfekt regelmäßig und
    // trotzdem keine Vertragszahlung.
    expect(passtZu(netcup, spur({ charakter: "Umschichtung" }))).toBe(false);
  });

  it("grenzt über die Betragsspanne ab", () => {
    const e: Vertragserkennung = { ...netcup, betragVon: 1000, betragBis: 2000 };
    expect(passtZu(e, spur({ betrag: -1650 }))).toBe(true);
    expect(passtZu(e, spur({ betrag: -800 }))).toBe(false);
    expect(passtZu(e, spur({ betrag: -2500 }))).toBe(false);
    // Grenzen einschließlich.
    expect(passtZu(e, spur({ betrag: -1000 }))).toBe(true);
    expect(passtZu(e, spur({ betrag: -2000 }))).toBe(true);
  });

  it("grenzt über den Zeitraum ab", () => {
    const e: Vertragserkennung = { ...netcup, gueltigAb: "2026-01-01", gueltigBis: "2026-12-31" };
    expect(passtZu(e, spur({ datum: "2026-05-10" }))).toBe(true);
    expect(passtZu(e, spur({ datum: "2025-12-31" }))).toBe(false);
    expect(passtZu(e, spur({ datum: "2027-01-01" }))).toBe(false);
  });

  it("grenzt über das Konto ab", () => {
    const e: Vertragserkennung = { ...netcup, kontoId: "k2" };
    expect(passtZu(e, spur({ kontoId: "k1" }))).toBe(false);
    expect(passtZu(e, spur({ kontoId: "k2" }))).toBe(true);
  });
});

/**
 * Der Fall, für den die Betragsspanne überhaupt existiert: derselbe Empfänger nimmt
 * Vertragszahlungen UND Einzelkäufe entgegen. Ohne Spanne zöge „Prime" jede Bestellung
 * mit sich — und das fiele erst auf, wenn irgendwann ein Budget nicht mehr stimmt.
 */
describe("standardErkennung", () => {
  it("hält fremde Zahlungen an denselben Empfänger draußen", () => {
    const prime = standardErkennung("v1", "Amazon", 899);
    expect(passtZu(prime, spur({ gegenpartei: "Amazon", betrag: -899 }))).toBe(true);
    expect(passtZu(prime, spur({ gegenpartei: "Amazon", betrag: -4790 }))).toBe(false);
  });

  it("lässt eine Preiserhöhung durch, ohne dass man nachsteuern muss", () => {
    const abo = standardErkennung("v1", "Streamingdienst", 1000);
    // +20 % ist noch drin (Obergrenze 180 %), −50 % auch (Untergrenze 60 % → 600).
    expect(passtZu(abo, spur({ gegenpartei: "Streamingdienst", betrag: -1200 }))).toBe(true);
    expect(passtZu(abo, spur({ gegenpartei: "Streamingdienst", betrag: -650 }))).toBe(true);
  });

  it("nimmt die Gläubiger-ID als zweiten Schlüssel auf", () => {
    const e = standardErkennung("v1", "Netcup GmbH", 1650, "DE98ZZZ09999999999");
    expect(e.schluessel).toContain("netcup");
    expect(e.schluessel).toContain("DE98ZZZ09999999999");
  });

  it("setzt ohne Betrag keine Spanne", () => {
    const e = standardErkennung("v1", "Netcup", 0);
    expect(e.betragVon).toBeUndefined();
    expect(e.betragBis).toBeUndefined();
  });
});

describe("vertragFuer", () => {
  it("lässt den Gläubiger-ID-Treffer vor dem Namenstreffer gewinnen", () => {
    const ueberName: Vertragserkennung = { vertragId: "v-name", schluessel: ["telefonica"] };
    const ueberId: Vertragserkennung = { vertragId: "v-id", schluessel: ["DE11ZZZ00000000001"] };
    const s = spur({ gegenpartei: "Telefonica Germany GmbH", glaeubigerId: "DE11ZZZ00000000001" });
    // Reihenfolge der Regeln darf das Ergebnis nicht bestimmen.
    expect(vertragFuer([ueberName, ueberId], s)).toBe("v-id");
    expect(vertragFuer([ueberId, ueberName], s)).toBe("v-id");
  });

  it("lässt bei zwei Namenstreffern die engere Betragsspanne gewinnen", () => {
    const weit: Vertragserkennung = { vertragId: "v-weit", schluessel: ["o2"], betragVon: 100, betragBis: 9000 };
    const eng: Vertragserkennung = { vertragId: "v-eng", schluessel: ["o2"], betragVon: 1900, betragBis: 2100 };
    const s = spur({ gegenpartei: "O2", betrag: -2000 });
    expect(vertragFuer([weit, eng], s)).toBe("v-eng");
    expect(vertragFuer([eng, weit], s)).toBe("v-eng");
  });

  it("liefert null, wenn keine Regel greift", () => {
    expect(vertragFuer([netcup], spur({ gegenpartei: "Edeka" }))).toBeNull();
  });
});

describe("zuordnungAbgleich", () => {
  it("ordnet neue Buchungen zu und lässt Unverändertes in Ruhe", () => {
    const spuren = [spur({ id: "b1" }), spur({ id: "b2" })];
    const bestand: Vertragszuordnung[] = [
      { istbuchungId: "b1", vertragId: "v1", herkunft: "automatisch" },
    ];
    const { setzen, entfernen } = zuordnungAbgleich([netcup], spuren, bestand);
    expect(setzen).toEqual([{ istbuchungId: "b2", vertragId: "v1", herkunft: "automatisch" }]);
    expect(entfernen).toEqual([]);
  });

  it("ist idempotent — ein zweiter Lauf will nichts mehr", () => {
    const spuren = [spur({ id: "b1" }), spur({ id: "b2" })];
    const erst = zuordnungAbgleich([netcup], spuren, []);
    const zweit = zuordnungAbgleich([netcup], spuren, erst.setzen);
    expect(zweit.setzen).toEqual([]);
    expect(zweit.entfernen).toEqual([]);
  });

  it("nimmt eine automatische Zuordnung zurück, wenn die Regel nicht mehr trifft", () => {
    // Die Betragsspanne wurde von Hand verengt — die 25-€-Buchung fällt heraus.
    const eng: Vertragserkennung = { ...netcup, betragVon: 1000, betragBis: 2000 };
    const bestand: Vertragszuordnung[] = [
      { istbuchungId: "b1", vertragId: "v1", herkunft: "automatisch" },
    ];
    const { setzen, entfernen } = zuordnungAbgleich([eng], [spur({ id: "b1", betrag: -2500 })], bestand);
    expect(setzen).toEqual([]);
    expect(entfernen).toEqual(["b1"]);
  });

  /**
   * Die Zusage, an der die Reversibilität hängt. Beide Richtungen zählen: eine von Hand
   * GESETZTE Zuordnung darf der Abgleich nicht wegrechnen, und ein von Hand GELÖSTES
   * „gehört zu keinem Vertrag" darf er nicht wieder zuordnen — sonst käme der Fehlgriff
   * bei jedem Lauf zurück und die Korrektur wäre wertlos.
   */
  it("rührt manuelle Zuordnungen nicht an — in beide Richtungen", () => {
    const bestand: Vertragszuordnung[] = [
      { istbuchungId: "b1", vertragId: null, herkunft: "manuell" },
      { istbuchungId: "b2", vertragId: "v-fremd", herkunft: "manuell" },
    ];
    const spuren = [spur({ id: "b1" }), spur({ id: "b2", gegenpartei: "Edeka" })];
    const { setzen, entfernen } = zuordnungAbgleich([netcup], spuren, bestand);
    expect(setzen).toEqual([]);
    expect(entfernen).toEqual([]);
  });
});
