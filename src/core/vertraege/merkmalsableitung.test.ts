// Merkmalsableitung — aus Belegen werden Vorschlaege.
//
// Der teure Fehler ist hier ein anderer als bei `passtZu`: dort ist es „findet zu viel",
// hier ist es ein Vorschlag, der PERFEKT AUSSIEHT und nichts taugt. Ein Muster aus einer
// Rechnungsnummer deckt jeden Beleg und trifft sonst nichts — die drei Zahlen daneben
// sagen „ideal", und die naechste Zahlung desselben Vertrags findet es nie. Deshalb
// stehen die Faelle zu Ziffern und zum Verwendungszweck unten und nicht am Rand.

import { describe, expect, it } from "vitest";
import { beleglageFuer, merkmaleAbleiten, type Beleglage } from "./merkmalsableitung";
import type { Vertragszuordnung } from "./vertragZuordnung";
import type { Zahlungsspur } from "../buchung/zahlungsspur";

function spur(teil: Partial<Zahlungsspur> = {}): Zahlungsspur {
  return {
    id: "b1",
    datum: "2026-05-10",
    betrag: -1650,
    gegenpartei: "Vibora GmbH",
    kontoId: "k1",
    charakter: "Aufwand",
    ...teil,
  };
}

/** Kurzform: die Belege sind die Zahlungen mit diesen IDs, Neins gibt es keine. */
function nur(...ids: string[]): Beleglage {
  return { dazu: new Set(ids), nichtDazu: new Set() };
}

function muster(kandidaten: ReturnType<typeof merkmaleAbleiten>): string[] {
  return kandidaten.map((k) => `${k.merkmal.art}:${k.merkmal.muster}`);
}

describe("merkmaleAbleiten", () => {
  it("gibt nichts heraus, wenn keine Zahlung von Hand zugeordnet ist", () => {
    const spuren = [spur({ id: "b1" }), spur({ id: "b2" })];
    expect(merkmaleAbleiten(spuren, nur())).toEqual([]);
  });

  it("schlaegt die Glaeubiger-ID exakt vor und stellt sie nach vorn", () => {
    const spuren = [
      spur({ id: "b1", gegenpartei: "Talberg Versicherung AG", glaeubigerId: "DE31ZZZ00000111222" }),
      spur({ id: "b2", gegenpartei: "Talberg Versicherung AG", glaeubigerId: "DE31ZZZ00000111222" }),
      spur({ id: "b3", gegenpartei: "Talberg Versicherung AG", glaeubigerId: "DE31ZZZ00000111222" }),
    ];

    const kandidaten = merkmaleAbleiten(spuren, nur("b1", "b2", "b3"));

    expect(kandidaten[0].merkmal).toEqual({
      art: "glaeubigerId",
      muster: "DE31ZZZ00000111222",
    });
    expect(kandidaten[0].decktAb).toBe(3);
    expect(kandidaten[0].widerspricht).toBe(0);
    expect(kandidaten[0].unbeschriftet).toBe(0);
  });

  it("findet den gemeinsamen Wortanfang, wo kein einzelner Name alle Belege deckt", () => {
    // Derselbe Anbieter, aber das Empfaengerfeld traegt mal die Kunden-, mal die
    // Rechnungskennung. Genau der Fall, den man von Hand nicht sieht.
    const spuren = [
      spur({ id: "b1", gegenpartei: "Nordhoff Energie KD-4711" }),
      spur({ id: "b2", gegenpartei: "Nordhoff Energie RE-8823" }),
    ];

    const kandidaten = merkmaleAbleiten(spuren, nur("b1", "b2"));
    const anfang = kandidaten.find((k) => k.merkmal.muster === "nordhoff energie*");

    expect(anfang?.decktAb).toBe(2);
    // Die Einzelnamen stehen auch da — sie decken aber je nur ihren eigenen Beleg.
    expect(kandidaten.find((k) => k.merkmal.muster === "nordhoff energie kd*")?.decktAb).toBe(1);
    expect(kandidaten[0]).toBe(anfang);
  });

  it("laesst den gemeinsamen Anfang weg, wenn er schon einer der ganzen Namen ist", () => {
    const spuren = [
      spur({ id: "b1", gegenpartei: "Weidling Fitness" }),
      spur({ id: "b2", gegenpartei: "Weidling Fitness" }),
    ];

    expect(muster(merkmaleAbleiten(spuren, nur("b1", "b2")))).toEqual([
      "empfaenger:weidling fitness*",
    ]);
  });

  it("stellt einen Kandidaten zurueck, der ein Hand-Nein trifft — auch den mit mehr Deckung", () => {
    const spuren = [
      spur({ id: "b1", gegenpartei: "Petrossen Bonn" }),
      spur({ id: "b2", gegenpartei: "Petrossen Bonn" }),
      spur({ id: "b3", gegenpartei: "Petrossen Bremen" }),
      spur({ id: "n1", gegenpartei: "Petrossen Kiel" }),
    ];

    const kandidaten = merkmaleAbleiten(spuren, {
      dazu: new Set(["b1", "b2", "b3"]),
      nichtDazu: new Set(["n1"]),
    });

    // `petrossen*` deckt alle drei Belege — und trifft das Nein. Der Beweis schlaegt die
    // Deckung, sonst stuende ein nachweislich falscher Vorschlag oben.
    const breit = kandidaten.find((k) => k.merkmal.muster === "petrossen*");
    expect(breit?.decktAb).toBe(3);
    expect(breit?.widerspricht).toBe(1);
    expect(muster(kandidaten)[0]).toBe("empfaenger:petrossen bonn*");
    const sortiert = muster(kandidaten);
    expect(sortiert[sortiert.length - 1]).toBe("empfaenger:petrossen*");
  });

  it("zaehlt als unbeschriftet nur, was in keiner der beiden Gruppen liegt", () => {
    const spuren = [
      spur({ id: "b1", gegenpartei: "Hollerbach Medien" }),
      spur({ id: "n1", gegenpartei: "Hollerbach Medien" }),
      spur({ id: "x1", gegenpartei: "Hollerbach Medien" }),
      spur({ id: "x2", gegenpartei: "Hollerbach Medien" }),
    ];

    const [kandidat] = merkmaleAbleiten(spuren, {
      dazu: new Set(["b1"]),
      nichtDazu: new Set(["n1"]),
    });

    expect(kandidat.decktAb).toBe(1);
    expect(kandidat.widerspricht).toBe(1);
    expect(kandidat.unbeschriftet).toBe(2);
  });

  it("zaehlt Umschichtungen nirgends mit", () => {
    const spuren = [
      spur({ id: "b1", gegenpartei: "Kettler Bausparen" }),
      // Die eigene Ueberweisung aufs Sparkonto traegt denselben Namen und ist keine
      // Vertragszahlung — dieselbe Grenze wie in `passtZu`.
      spur({ id: "u1", gegenpartei: "Kettler Bausparen", charakter: "Umschichtung" }),
    ];

    const [kandidat] = merkmaleAbleiten(spuren, nur("b1"));

    expect(kandidat.decktAb).toBe(1);
    expect(kandidat.unbeschriftet).toBe(0);
  });

  it("zieht den Verwendungszweck erst ab zwei Belegen heran", () => {
    const einer = [
      spur({ id: "b1", gegenpartei: "Marnitz", verwendungszweck: "Mitgliedsbeitrag Sportverein" }),
    ];
    expect(muster(merkmaleAbleiten(einer, nur("b1")))).toEqual(["empfaenger:marnitz*"]);

    const zwei = [
      ...einer,
      spur({ id: "b2", gegenpartei: "Marnitz", verwendungszweck: "Mitgliedsbeitrag Sportverein" }),
    ];
    const kandidaten = muster(merkmaleAbleiten(zwei, nur("b1", "b2")));
    expect(kandidaten).toContain("verwendungszweck:*mitgliedsbeitrag*");
    expect(kandidaten).toContain("verwendungszweck:*sportverein*");
  });

  it("macht aus keinem Wort mit Ziffern ein Muster", () => {
    // „vertrag2026" steht in beiden Belegen und saehe als Muster perfekt aus: deckt alles,
    // trifft sonst nichts. Die naechste Rate traegt eine andere Nummer.
    const spuren = [
      spur({ id: "b1", gegenpartei: "Ludenbeck", verwendungszweck: "Wartung vertrag2026 Rate 1" }),
      spur({ id: "b2", gegenpartei: "Ludenbeck", verwendungszweck: "Wartung vertrag2026 Rate 2" }),
    ];

    const kandidaten = muster(merkmaleAbleiten(spuren, nur("b1", "b2")));

    expect(kandidaten).toContain("verwendungszweck:*wartung*");
    expect(kandidaten.some((m) => m.includes("2026"))).toBe(false);
    // „Rate" bleibt: es steht in beiden Belegen und traegt keine Ziffer. Gestrichen wird
    // nach der Ziffernregel, nicht danach, wie nichtssagend ein Wort wirkt.
    expect(kandidaten).toContain("verwendungszweck:*rate*");
  });

  it("liefert dieselbe Reihenfolge, egal wie die Zahlungen hereinkommen", () => {
    const spuren = [
      spur({ id: "b1", gegenpartei: "Aschenbrenner Strom", glaeubigerId: "DE09ZZZ00000333444" }),
      spur({ id: "b2", gegenpartei: "Aschenbrenner Strom Nord" }),
      spur({ id: "b3", gegenpartei: "Aschenbrenner Strom Sued" }),
    ];
    const belege = nur("b1", "b2", "b3");

    expect(muster(merkmaleAbleiten([...spuren].reverse(), belege))).toEqual(
      muster(merkmaleAbleiten(spuren, belege)),
    );
  });
});

describe("beleglageFuer", () => {
  const zuordnungen: Vertragszuordnung[] = [
    { istbuchungId: "b1", vertragId: "v1", herkunft: "manuell" },
    { istbuchungId: "b2", vertragId: "v1", herkunft: "automatisch" },
    { istbuchungId: "n1", vertragId: null, herkunft: "manuell" },
    { istbuchungId: "n2", vertragId: null, herkunft: "automatisch" },
    { istbuchungId: "f1", vertragId: "v2", herkunft: "manuell" },
  ];

  it("nimmt nur Handzuordnungen als Beleg — sonst belegt die Regel sich selbst", () => {
    // `b2` haengt an demselben Vertrag, aber die Automatik hat es gesetzt. Als Beleg
    // waere es das Ergebnis der Regel, das die Regel begruendet.
    const lage = beleglageFuer("v1", zuordnungen);
    expect([...lage.dazu]).toEqual(["b1"]);
  });

  it("nimmt nur ein Nein von Hand als Gegenbeleg", () => {
    const lage = beleglageFuer("v1", zuordnungen);
    expect([...lage.nichtDazu]).toEqual(["n1"]);
  });

  it("laesst eine Zuordnung zu einem ANDEREN Vertrag unbeschriftet", () => {
    // Sie ist ein starkes Indiz gegen v1 und trotzdem kein Nein zu v1 — und ein Indiz
    // gehoert nicht in eine Gruppe, die „von Hand gesagt" heisst.
    const lage = beleglageFuer("v1", zuordnungen);
    expect(lage.dazu.has("f1")).toBe(false);
    expect(lage.nichtDazu.has("f1")).toBe(false);
  });

  it("gilt fuer jeden Vertrag: dasselbe Nein zaehlt auch beim naechsten", () => {
    expect([...beleglageFuer("v2", zuordnungen).nichtDazu]).toEqual(["n1"]);
    expect([...beleglageFuer("v2", zuordnungen).dazu]).toEqual(["f1"]);
  });
});
