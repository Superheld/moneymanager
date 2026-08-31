// Vertragszuordnung — Regel trifft Zahlung, und was der Abgleich daraus macht.
//
// Der teure Fehler ist hier nicht „findet nichts", sondern „findet zu viel": ein Vertrag,
// dessen Regel jede Zahlung an denselben Empfänger einsammelt, verfälscht später jede
// Auswertung, die auf der Zuordnung aufbaut. Der zweite ist „Handarbeit verschwindet" —
// beides steht unten als eigener Fall.

import { describe, expect, it } from "vitest";
import {
  erkennungsDiagnose,
  istMerkmalsart,
  MERKMALSARTEN,
  passtZu,
  spannenVorschlag,
  standardErkennung,
  vertragFuer,
  zuordnungAbgleich,
  type Vertragserkennung,
  type Vertragszuordnung,
} from "./vertragZuordnung";
import type { Zahlungsspur } from "../buchung/zahlungsspur";

function spur(teil: Partial<Zahlungsspur> = {}): Zahlungsspur {
  return {
    id: "b1",
    datum: "2026-05-10",
    betrag: -1650,
    gegenpartei: "Vibora GmbH",
    kategorieId: "hosting",
    kontoId: "k1",
    charakter: "Aufwand",
    ...teil,
  };
}

const vibora: Vertragserkennung = {
  vertragId: "v1",
  merkmale: [{ art: "empfaenger", muster: "vibora" }],
};

describe("passtZu", () => {
  it("trifft über den normalisierten Namen, Rechtsform und Schreibweise egal", () => {
    expect(passtZu(vibora, spur({ gegenpartei: "VIBORA GmbH" }))).toBe(true);
    expect(passtZu(vibora, spur({ gegenpartei: "vibora" }))).toBe(true);
  });

  it("trifft über die Gläubiger-ID, auch wenn der Name anders lautet", () => {
    const e: Vertragserkennung = {
      vertragId: "v1",
      merkmale: [{ art: "glaeubigerId", muster: "DE98ZZZ09999999999" }],
    };
    expect(passtZu(e, spur({ gegenpartei: "Irgendein Rechenzentrum", glaeubigerId: "DE98ZZZ09999999999" }))).toBe(true);
  });

  it("lässt Umschichtungen draußen", () => {
    // Eine monatliche Umbuchung aufs eigene Tagesgeldkonto ist perfekt regelmäßig und
    // trotzdem keine Vertragszahlung.
    expect(passtZu(vibora, spur({ charakter: "Umschichtung" }))).toBe(false);
  });

  /**
   * Merkmale sind typisiert und NICHT austauschbar: eine Gläubiger-ID darf nicht über den
   * Empfängernamen greifen und umgekehrt. In einer gemischten Liste war das nicht zu
   * trennen — dort hätte ein Empfängername, der zufällig wie eine ID aussieht, auf beiden
   * Feldern gezogen.
   */
  it("prüft ein Merkmal nur gegen das Feld seiner Art", () => {
    const alsId: Vertragserkennung = {
      vertragId: "v1",
      merkmale: [{ art: "glaeubigerId", muster: "vibora" }],
    };
    // Derselbe Text, aber als Gläubiger-ID gemeint — der Empfängername zählt nicht.
    expect(passtZu(alsId, spur({ gegenpartei: "Vibora GmbH" }))).toBe(false);
    expect(passtZu(alsId, spur({ gegenpartei: "X", glaeubigerId: "vibora" }))).toBe(true);
  });

  /**
   * Wildcards. Der Fall dahinter: Abbuchungen tragen Vertrags-, Rechnungs- oder
   * Ortsangaben im Empfängerfeld, und ohne Platzhalter bräuchte jede Schreibweise eine
   * eigene Zeile.
   */
  it("versteht * als beliebigen Text", () => {
    const e: Vertragserkennung = {
      vertragId: "v1",
      merkmale: [{ art: "empfaenger", muster: "petrossen*" }],
    };
    expect(passtZu(e, spur({ gegenpartei: "Petrossen Bonn" }))).toBe(true);
    expect(passtZu(e, spur({ gegenpartei: "PETROSSEN MUENCHEN GMBH" }))).toBe(true);
    expect(passtZu(e, spur({ gegenpartei: "Kreiswerke Bonn" }))).toBe(false);
  });

  it("nimmt alles außer dem Stern wörtlich", () => {
    // Der Punkt ist ein Punkt, kein „beliebiges Zeichen" — sonst träfe „a.b" auch „axb".
    const e: Vertragserkennung = {
      vertragId: "v1",
      merkmale: [{ art: "empfaenger", muster: "s.w*" }],
    };
    expect(passtZu(e, spur({ gegenpartei: "S.W. Musterstadt" }))).toBe(true);
    expect(passtZu(e, spur({ gegenpartei: "sxw Energie" }))).toBe(false);
  });

  /**
   * Der Empfänger wird gegen ZWEI Formen geprüft: den Namen aus dem Auszug und seine
   * normalisierte Form. Beide begegnen einem an verschiedenen Stellen der Oberfläche —
   * wer eine davon abtippt, soll einen Treffer bekommen und nicht raten müssen.
   */
  it("trifft sowohl den Namen aus dem Auszug als auch seine normalisierte Form", () => {
    const roh: Vertragserkennung = {
      vertragId: "v1",
      merkmale: [{ art: "empfaenger", muster: "Vibora GmbH" }],
    };
    expect(passtZu(roh, spur({ gegenpartei: "Vibora GmbH" }))).toBe(true);
    // „vibora" ist die normalisierte Form desselben Namens.
    expect(passtZu(vibora, spur({ gegenpartei: "Vibora GmbH" }))).toBe(true);
  });

  it("grenzt über die Betragsspanne ab", () => {
    const e: Vertragserkennung = { ...vibora, betragVon: 1000, betragBis: 2000 };
    expect(passtZu(e, spur({ betrag: -1650 }))).toBe(true);
    expect(passtZu(e, spur({ betrag: -800 }))).toBe(false);
    expect(passtZu(e, spur({ betrag: -2500 }))).toBe(false);
    // Grenzen einschließlich.
    expect(passtZu(e, spur({ betrag: -1000 }))).toBe(true);
    expect(passtZu(e, spur({ betrag: -2000 }))).toBe(true);
  });

  it("grenzt über den Zeitraum ab", () => {
    const e: Vertragserkennung = { ...vibora, gueltigAb: "2026-01-01", gueltigBis: "2026-12-31" };
    expect(passtZu(e, spur({ datum: "2026-05-10" }))).toBe(true);
    expect(passtZu(e, spur({ datum: "2025-12-31" }))).toBe(false);
    expect(passtZu(e, spur({ datum: "2027-01-01" }))).toBe(false);
  });

  it("grenzt über das Konto ab", () => {
    const e: Vertragserkennung = { ...vibora, kontoId: "k2" };
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
    const prime = standardErkennung("v1", "Arnholt", 899);
    expect(passtZu(prime, spur({ gegenpartei: "Arnholt", betrag: -899 }))).toBe(true);
    expect(passtZu(prime, spur({ gegenpartei: "Arnholt", betrag: -4790 }))).toBe(false);
  });

  it("lässt eine Preiserhöhung durch, ohne dass man nachsteuern muss", () => {
    const abo = standardErkennung("v1", "Streamingdienst", 1000);
    // +20 % ist noch drin (Obergrenze 180 %), −50 % auch (Untergrenze 60 % → 600).
    expect(passtZu(abo, spur({ gegenpartei: "Streamingdienst", betrag: -1200 }))).toBe(true);
    expect(passtZu(abo, spur({ gegenpartei: "Streamingdienst", betrag: -650 }))).toBe(true);
  });

  it("nimmt die Gläubiger-ID als zweiten Schlüssel auf", () => {
    const e = standardErkennung("v1", "Vibora GmbH", 1650, "DE98ZZZ09999999999");
    expect(e.merkmale).toContainEqual({ art: "empfaenger", muster: "vibora*" });
    expect(e.merkmale).toContainEqual({ art: "glaeubigerId", muster: "DE98ZZZ09999999999" });
  });

  /**
   * Der Fall, an dem die Zuordnung vorher zur Hälfte scheiterte: derselbe Anbieter bucht
   * mal unter seinem blossen Namen, mal mit angehängtem Produkt- oder Rechnungszusatz.
   * Ohne Stern in der Vorbelegung traf die Regel nur die erste Schreibweise, und der Rest
   * stand als „keinem Vertrag zugeordnet" da — was aussieht, als hätte die Erkennung gar
   * nicht gelaufen.
   */
  it("trifft denselben Anbieter auch mit angehängtem Zusatz", () => {
    const e = standardErkennung("v1", "Ohlert", 1800);
    expect(passtZu(e, spur({ gegenpartei: "Ohlert", betrag: -1800 }))).toBe(true);
    expect(passtZu(e, spur({ gegenpartei: "Ohlert* Monatspaket", betrag: -1800 }))).toBe(true);
    // Die Betragsspanne bleibt die Bremse — sie ist es, die Fremdes draussen hält.
    expect(passtZu(e, spur({ gegenpartei: "Ohlert* Grossbestellung", betrag: -19900 }))).toBe(false);
    // Und der Stern hängt HINTEN: wer den Namen nur irgendwo im Text trägt, ist nicht gemeint.
    expect(passtZu(e, spur({ gegenpartei: "Zahlung an Ohlert", betrag: -1800 }))).toBe(false);
  });

  it("setzt ohne Betrag keine Spanne", () => {
    const e = standardErkennung("v1", "Vibora", 0);
    expect(e.betragVon).toBeUndefined();
    expect(e.betragBis).toBeUndefined();
  });
});

describe("vertragFuer", () => {
  it("lässt den Gläubiger-ID-Treffer vor dem Namenstreffer gewinnen", () => {
    const ueberName: Vertragserkennung = {
      vertragId: "v-name",
      merkmale: [{ art: "empfaenger", muster: "telefonica" }],
    };
    const ueberId: Vertragserkennung = {
      vertragId: "v-id",
      merkmale: [{ art: "glaeubigerId", muster: "DE11ZZZ00000000001" }],
    };
    const s = spur({ gegenpartei: "Telefonica Germany GmbH", glaeubigerId: "DE11ZZZ00000000001" });
    // Reihenfolge der Regeln darf das Ergebnis nicht bestimmen.
    expect(vertragFuer([ueberName, ueberId], s)).toBe("v-id");
    expect(vertragFuer([ueberId, ueberName], s)).toBe("v-id");
  });

  it("lässt bei zwei Namenstreffern die engere Betragsspanne gewinnen", () => {
    const muster = [{ art: "empfaenger", muster: "o2" }] as const;
    const weit: Vertragserkennung = { vertragId: "v-weit", merkmale: muster, betragVon: 100, betragBis: 9000 };
    const eng: Vertragserkennung = { vertragId: "v-eng", merkmale: muster, betragVon: 1900, betragBis: 2100 };
    const s = spur({ gegenpartei: "O2", betrag: -2000 });
    expect(vertragFuer([weit, eng], s)).toBe("v-eng");
    expect(vertragFuer([eng, weit], s)).toBe("v-eng");
  });

  it("liefert null, wenn keine Regel greift", () => {
    expect(vertragFuer([vibora], spur({ gegenpartei: "Nordhoff" }))).toBeNull();
  });
});

describe("zuordnungAbgleich", () => {
  it("ordnet neue Buchungen zu und lässt Unverändertes in Ruhe", () => {
    const spuren = [spur({ id: "b1" }), spur({ id: "b2" })];
    const bestand: Vertragszuordnung[] = [
      { istbuchungId: "b1", vertragId: "v1", herkunft: "automatisch" },
    ];
    const { setzen, entfernen } = zuordnungAbgleich([vibora], spuren, bestand);
    expect(setzen).toEqual([{ istbuchungId: "b2", vertragId: "v1", herkunft: "automatisch" }]);
    expect(entfernen).toEqual([]);
  });

  it("ist idempotent — ein zweiter Lauf will nichts mehr", () => {
    const spuren = [spur({ id: "b1" }), spur({ id: "b2" })];
    const erst = zuordnungAbgleich([vibora], spuren, []);
    const zweit = zuordnungAbgleich([vibora], spuren, erst.setzen);
    expect(zweit.setzen).toEqual([]);
    expect(zweit.entfernen).toEqual([]);
  });

  it("nimmt eine automatische Zuordnung zurück, wenn die Regel nicht mehr trifft", () => {
    // Die Betragsspanne wurde von Hand verengt — die 25-€-Buchung fällt heraus.
    const eng: Vertragserkennung = { ...vibora, betragVon: 1000, betragBis: 2000 };
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
    const spuren = [spur({ id: "b1" }), spur({ id: "b2", gegenpartei: "Nordhoff" })];
    const { setzen, entfernen } = zuordnungAbgleich([vibora], spuren, bestand);
    expect(setzen).toEqual([]);
    expect(entfernen).toEqual([]);
  });
});

describe("erkennungsDiagnose", () => {
  // Der gemeldete Fall: `*ard*` trifft, aber die Betragsspanne aus `standardErkennung`
  // räumt alles weg — und die Vorschau zeigte nur „0 Treffer", ohne zu sagen, woran es lag.
  const spuren: Zahlungsspur[] = [
    { id: "1", datum: "2026-03-01", betrag: -5508, gegenpartei: "Suedwestrundfunk ARD ZDF", charakter: "Aufwand", kontoId: "giro" },
    { id: "2", datum: "2026-06-01", betrag: -5508, gegenpartei: "Suedwestrundfunk ARD ZDF", charakter: "Aufwand", kontoId: "giro" },
    { id: "3", datum: "2026-06-05", betrag: -2000, gegenpartei: "Nordhoff", charakter: "Aufwand", kontoId: "giro" },
    { id: "4", datum: "2026-06-06", betrag: -9000, gegenpartei: "Tagesgeldkonto", charakter: "Umschichtung", kontoId: "giro" },
  ];

  it("zeigt, dass der Stern in der Mitte trifft", () => {
    const d = erkennungsDiagnose(
      { vertragId: "v", merkmale: [{ art: "empfaenger", muster: "*ard*" }] },
      spuren,
    );
    // Die Umschichtung zählt gar nicht erst mit — sie kann nie eine Vertragszahlung sein.
    expect(d.grundmenge).toBe(3);
    expect(d.nachMerkmalen).toBe(2);
    expect(d.nachKonto).toBe(2);
  });

  it("benennt die Betragsspanne als die Stufe, die alles wegnimmt", () => {
    const d = erkennungsDiagnose(
      {
        vertragId: "v",
        merkmale: [{ art: "empfaenger", muster: "*ard*" }],
        betragVon: 10000,
        betragBis: 20000,
      },
      spuren,
    );
    expect(d.nachMerkmalen).toBe(2);
    expect(d.nachBetrag).toBe(0);
  });

  it("ein Muster ohne Sterne trifft nur den ganzen Namen", () => {
    const d = erkennungsDiagnose(
      { vertragId: "v", merkmale: [{ art: "empfaenger", muster: "ard" }] },
      spuren,
    );
    expect(d.nachMerkmalen).toBe(0);
  });
});

/**
 * Das Zweck-Merkmal — ein Nachtrag, und der Test hält vor allem fest, was sich NICHT
 * geändert hat: die Vorbelegung legt keins an. „Ein Vertrag hängt am Empfänger, nicht am
 * Text" bleibt die Vorgabe; sie ist nur keine Decke mehr.
 */
describe("Merkmal auf den Verwendungszweck", () => {
  it("legt die Vorbelegung nicht von selbst an", () => {
    const e = standardErkennung("v1", "Ohlert", 1800);
    expect(e.merkmale.some((m) => m.art === "verwendungszweck")).toBe(false);
  });

  it("trifft über den Zweck, wo der Empfänger nichts hergibt", () => {
    const e: Vertragserkennung = {
      vertragId: "v1",
      merkmale: [{ art: "verwendungszweck", muster: "*Miete Wohnung 12*" }],
    };
    // Empfänger ist ein Personenname und sagt über den Vertrag nichts.
    expect(passtZu(e, spur({ gegenpartei: "Talmberg", verwendungszweck: "Miete Wohnung 12 August" }))).toBe(true);
    expect(passtZu(e, spur({ gegenpartei: "Talmberg", verwendungszweck: "Geburtstag" }))).toBe(false);
  });

  /**
   * Der Zweck wird NICHT normalisiert. `anbieterSchluessel` wirft Ziffern weg — genau die
   * Vertrags- und Rechnungsnummern, wegen derer man den Zweck überhaupt heranzieht.
   */
  it("behält Ziffern im Zweck, statt sie wegzunormalisieren", () => {
    const e: Vertragserkennung = {
      vertragId: "v1",
      merkmale: [{ art: "verwendungszweck", muster: "*4711*" }],
    };
    expect(passtZu(e, spur({ verwendungszweck: "Kundennummer 4711" }))).toBe(true);
    expect(passtZu(e, spur({ verwendungszweck: "Kundennummer 4712" }))).toBe(false);
  });

  it("kennt genau die Arten, die der Kern aufzählt", () => {
    expect(MERKMALSARTEN).toEqual(["glaeubigerId", "empfaenger", "verwendungszweck"]);
    expect(istMerkmalsart("verwendungszweck")).toBe(true);
    expect(istMerkmalsart("empfaenger")).toBe(true);
    expect(istMerkmalsart("betrag")).toBe(false);
    expect(istMerkmalsart(undefined)).toBe(false);
  });
});

/**
 * Der Spannen-Vorschlag. Der Fall, für den es ihn gibt: ein Vertrag mit schwankendem
 * Betrag — Verbrauchsabrechnung, Fremdwährung —, bei dem die aus EINEM Betrag abgeleitete
 * Vorbelegung (0,6× bis 1,8×) den grössten Teil der Zahlungen wegfiltert.
 */
describe("spannenVorschlag", () => {
  const merkmale = [{ art: "empfaenger" as const, muster: "ohlert*" }];

  it("umspannt alle Zahlungen, die die Merkmale treffen", () => {
    const e: Vertragserkennung = { vertragId: "v1", merkmale, betragVon: 1000, betragBis: 3000 };
    const spuren = [
      spur({ id: "a", gegenpartei: "Ohlert", betrag: -500 }),
      spur({ id: "b", gegenpartei: "Ohlert", betrag: -2000 }),
      spur({ id: "c", gegenpartei: "Ohlert", betrag: -8000 }),
    ];
    // Untergrenze exakt der kleinste Wert, Obergrenze mit 15 % Luft nach oben.
    expect(spannenVorschlag(e, spuren)).toEqual({ von: 500, bis: 9200 });
  });

  /**
   * Zeitraum und Konto bleiben drin, die Betragsspanne selbst nicht. Sonst käme immer
   * die vorhandene Spanne wieder heraus — und was jemand ausdrücklich ausgeschlossen
   * hat, soll der Vorschlag nicht durch die Hintertür einsammeln.
   */
  it("achtet auf den Zeitraum, aber nicht auf die eigene Betragsspanne", () => {
    const e: Vertragserkennung = {
      vertragId: "v1", merkmale, betragVon: 1000, betragBis: 3000, gueltigAb: "2026-01-01",
    };
    const spuren = [
      spur({ id: "alt", gegenpartei: "Ohlert", betrag: -99900, datum: "2025-06-01" }),
      spur({ id: "neu", gegenpartei: "Ohlert", betrag: -2000, datum: "2026-06-01" }),
    ];
    expect(spannenVorschlag(e, spuren)).toEqual({ von: 2000, bis: 2300 });
  });

  it("schweigt, wenn die Merkmale gar nichts treffen", () => {
    const e: Vertragserkennung = { vertragId: "v1", merkmale };
    expect(spannenVorschlag(e, [spur({ gegenpartei: "Vibora", betrag: -2000 })])).toBeUndefined();
  });

  it("lässt Umschichtungen draussen — sie sind nie Vertragszahlungen", () => {
    const e: Vertragserkennung = { vertragId: "v1", merkmale };
    const spuren = [
      spur({ id: "a", gegenpartei: "Ohlert", betrag: -2000 }),
      spur({ id: "b", gegenpartei: "Ohlert", betrag: -50000, charakter: "Umschichtung" }),
    ];
    expect(spannenVorschlag(e, spuren)).toEqual({ von: 2000, bis: 2300 });
  });
});

/**
 * Der Umbuchungsvertrag im Abgleich. Er hat keine Erkennungsregel und kann keine haben:
 * bei einer Zahlung zwischen zwei eigenen Konten steht beim Empfänger je nach Bank die
 * eigene IBAN, der eigene Name oder nichts.
 */
describe("zuordnungAbgleich — Umbuchungsverträge", () => {
  const sparregel = {
    id: "r-spar",
    bezeichnung: "Sparrate",
    betrag: -20000,
    rhythmus: "monatlich" as const,
    startdatum: "2026-01-01",
    charakter: "Umschichtung" as const,
    kontoId: "giro",
    gegenkontoId: "tagesgeld",
    vertragId: "v-spar",
  };
  const umschichtung: Zahlungsspur = {
    id: "b-spar",
    datum: "2026-06-01",
    betrag: -20000,
    gegenpartei: "",
    verwendungszweck: "",
    kontoId: "giro",
    gegenkontoId: "tagesgeld",
    charakter: "Umschichtung",
  };

  it("ordnet die Umschichtung ihrem Vertrag zu", () => {
    const { setzen } = zuordnungAbgleich([], [umschichtung], [], [sparregel]);
    expect(setzen).toEqual([
      { istbuchungId: "b-spar", vertragId: "v-spar", herkunft: "automatisch" },
    ]);
  });

  // Ohne den Parameter verhält sich der Abgleich wie vorher — das ist die Zusage, unter
  // der jeder bestehende Aufrufer unverändert bleiben durfte.
  it("lässt sie ohne Umbuchungsregeln unangetastet", () => {
    expect(zuordnungAbgleich([], [umschichtung], []).setzen).toEqual([]);
  });

  it("rührt eine Handentscheidung nicht an", () => {
    const bestand = [{ istbuchungId: "b-spar", vertragId: null, herkunft: "manuell" as const }];
    const { setzen, entfernen } = zuordnungAbgleich([], [umschichtung], bestand, [sparregel]);
    expect(setzen).toEqual([]);
    expect(entfernen).toEqual([]);
  });
});
