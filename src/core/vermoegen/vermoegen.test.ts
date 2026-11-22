// Alle Zahlen hier sind erfunden. Was echt ist, sind die Konstellationen: eine Reihe mit
// Lücken (niemand trägt jeden Monat einen Wert ein), ein Stichtag vor der ersten
// Beobachtung, zwei Beobachtungen im selben Monat und ein stillgelegter Eintrag.

import { describe, expect, it } from "vitest";
import type { IstBuchung } from "../buchung/istbuchung";
import type { Zahlungskonto } from "../konten/konto";
import {
  beobachtungAm,
  ersteBeobachtung,
  juengsteBeobachtung,
  nettovermoegen,
  nettovermoegenVerlauf,
  wirdGefuehrt,
  type Verbindlichkeitsstand,
  type VermoegensEingabe,
  type Vermoegenswert,
} from "./vermoegen";

const wert = (stichtag: string, betrag: number, gegenstandId = "g1"): Vermoegenswert => ({
  gegenstandId,
  stichtag,
  wert: betrag,
});

const stand = (
  stichtag: string,
  restschuld: number,
  verbindlichkeitId = "v1",
): Verbindlichkeitsstand => ({ verbindlichkeitId, stichtag, restschuld });

const konto = (id: string, saldo: number, klasse: Zahlungskonto["klasse"] = "liquide"): Zahlungskonto => ({
  id,
  bezeichnung: id,
  typ: "Giro",
  klasse,
  inhaberIds: [],
  saldo,
});

const buchung = (id: string, kontoId: string, datum: string, betrag: number): IstBuchung => ({
  id,
  datum,
  betrag,
  kontoId,
  charakter: betrag < 0 ? "Aufwand" : "Ertrag",
  quelle: "manuell",
});

const LEER: VermoegensEingabe = {
  konten: [],
  buchungen: [],
  depots: [],
  depotwerte: [],
  gegenstaende: [],
  werte: [],
  verbindlichkeiten: [],
  staende: [],
};

describe("beobachtungAm", () => {
  const reihe = [wert("2025-12-31", 300_000_00), wert("2024-12-31", 280_000_00)];

  it("nimmt die jüngste Beobachtung bis zum Stichtag, unabhängig von der Reihenfolge", () => {
    expect(beobachtungAm(reihe, "2025-06-30")?.wert).toBe(280_000_00);
    expect(beobachtungAm(reihe, "2026-03-01")?.wert).toBe(300_000_00);
  });

  it("zählt den Stichtag selbst mit", () => {
    expect(beobachtungAm(reihe, "2025-12-31")?.wert).toBe(300_000_00);
  });

  it("interpoliert nicht zwischen zwei Beobachtungen", () => {
    // Auf halbem Weg gilt weiter der alte Wert — kein Mittel aus beiden.
    expect(beobachtungAm(reihe, "2025-07-01")?.wert).toBe(280_000_00);
  });

  it("kennt vor der ersten Beobachtung keinen Wert", () => {
    expect(beobachtungAm(reihe, "2024-12-30")).toBeUndefined();
  });

  it("kennt in einer leeren Reihe keinen Wert", () => {
    expect(beobachtungAm([], "2026-01-01")).toBeUndefined();
    expect(juengsteBeobachtung([])).toBeUndefined();
  });

  it("gilt für Restschulden genauso", () => {
    const staende = [stand("2025-12-31", 90_000_00), stand("2024-12-31", 100_000_00)];
    expect(beobachtungAm(staende, "2025-03-15")?.restschuld).toBe(100_000_00);
    expect(juengsteBeobachtung(staende)?.restschuld).toBe(90_000_00);
  });
});

describe("wirdGefuehrt", () => {
  it("liest ein fehlendes Feld als ja", () => {
    expect(wirdGefuehrt({})).toBe(true);
    expect(wirdGefuehrt({ aktiv: true })).toBe(true);
    expect(wirdGefuehrt({ aktiv: false })).toBe(false);
  });
});

describe("nettovermoegen", () => {
  it("ist ohne alles null", () => {
    expect(nettovermoegen(LEER, "2026-06-30")).toEqual({
      stichtag: "2026-06-30",
      konten: 0,
      depots: 0,
      vermoegenswerte: 0,
      schulden: 0,
      netto: 0,
    });
  });

  it("zählt Konten jeder Klasse und nur die Buchungen bis zum Stichtag", () => {
    const e: VermoegensEingabe = {
      ...LEER,
      konten: [konto("giro", 1_000_00), konto("vorsorge", 5_000_00, "vorsorge")],
      buchungen: [
        buchung("b1", "giro", "2026-05-10", -200_00),
        buchung("b2", "vorsorge", "2026-06-30", 300_00),
        buchung("b3", "giro", "2026-07-01", -999_00),
      ],
    };
    expect(nettovermoegen(e, "2026-06-30").konten).toBe(1_000_00 - 200_00 + 5_000_00 + 300_00);
  });

  it("nimmt je Depot den jüngsten Wert bis zum Stichtag", () => {
    const e: VermoegensEingabe = {
      ...LEER,
      depotwerte: [
        { depotId: "d1", stichtag: "2026-05-01", gesamtwert: 10_000_00 },
        { depotId: "d1", stichtag: "2026-06-15", gesamtwert: 11_000_00 },
        { depotId: "d1", stichtag: "2026-07-15", gesamtwert: 99_000_00 },
        { depotId: "d2", stichtag: "2026-04-01", gesamtwert: 2_000_00 },
        // Dieses Depot wurde erst nach dem Stichtag zum ersten Mal abgerufen.
        { depotId: "d3", stichtag: "2026-08-01", gesamtwert: 7_000_00 },
      ],
    };
    expect(nettovermoegen(e, "2026-06-30").depots).toBe(11_000_00 + 2_000_00);
  });

  it("zieht Schulden ab und führt sie positiv", () => {
    const e: VermoegensEingabe = {
      ...LEER,
      konten: [konto("giro", 4_000_00)],
      gegenstaende: [{ id: "g1", bezeichnung: "Wohnung", art: "immobilie" }],
      werte: [wert("2025-12-31", 250_000_00)],
      verbindlichkeiten: [{ id: "v1", bezeichnung: "Darlehen", art: "immobilienkredit" }],
      staende: [stand("2025-12-31", 180_000_00)],
    };
    const n = nettovermoegen(e, "2026-03-31");
    expect(n.vermoegenswerte).toBe(250_000_00);
    expect(n.schulden).toBe(180_000_00);
    expect(n.netto).toBe(4_000_00 + 250_000_00 - 180_000_00);
  });

  it("lässt aus, was zum Stichtag noch nie beobachtet wurde", () => {
    const e: VermoegensEingabe = {
      ...LEER,
      gegenstaende: [
        { id: "g1", bezeichnung: "Wohnung", art: "immobilie" },
        { id: "g2", bezeichnung: "Anhänger", art: "fahrzeug" },
      ],
      werte: [wert("2026-09-01", 250_000_00, "g1")],
      verbindlichkeiten: [{ id: "v1", bezeichnung: "Darlehen", art: "ratenkredit" }],
    };
    const n = nettovermoegen(e, "2026-06-30");
    expect(n.vermoegenswerte).toBe(0);
    expect(n.schulden).toBe(0);
  });

  it("überspringt Beobachtungen, deren Stammsatz es nicht gibt", () => {
    // Ohne Fremdschlüsselprüfung (sql.js) kann eine verwaiste Zeile stehenbleiben; sie
    // darf dann nicht als namenloser Betrag in der Summe landen.
    const e: VermoegensEingabe = { ...LEER, werte: [wert("2026-01-01", 5_000_00, "weg")] };
    expect(nettovermoegen(e, "2026-06-30").vermoegenswerte).toBe(0);
  });

  describe("stillgelegt", () => {
    const e: VermoegensEingabe = {
      ...LEER,
      gegenstaende: [{ id: "g1", bezeichnung: "Transporter", art: "fahrzeug", aktiv: false }],
      werte: [wert("2024-12-31", 12_000_00), wert("2025-12-31", 9_000_00)],
      verbindlichkeiten: [{ id: "v1", bezeichnung: "Finanzierung", art: "ratenkredit", aktiv: false }],
      staende: [stand("2024-12-31", 6_000_00), stand("2025-12-31", 2_000_00)],
    };

    it("zählt nach der letzten Beobachtung nicht mehr", () => {
      const n = nettovermoegen(e, "2026-01-01");
      expect(n.vermoegenswerte).toBe(0);
      expect(n.schulden).toBe(0);
    });

    it("zählt am Tag der letzten Beobachtung noch", () => {
      const n = nettovermoegen(e, "2025-12-31");
      expect(n.vermoegenswerte).toBe(9_000_00);
      expect(n.schulden).toBe(2_000_00);
    });

    it("behält seine Geschichte davor", () => {
      const n = nettovermoegen(e, "2025-06-30");
      expect(n.vermoegenswerte).toBe(12_000_00);
      expect(n.schulden).toBe(6_000_00);
    });
  });
});

describe("nettovermoegenVerlauf", () => {
  const e: VermoegensEingabe = {
    ...LEER,
    konten: [konto("giro", 1_000_00)],
    buchungen: [
      buchung("b1", "giro", "2026-01-20", 500_00),
      buchung("b2", "giro", "2026-03-05", -100_00),
    ],
    gegenstaende: [{ id: "g1", bezeichnung: "Wohnung", art: "immobilie" }],
    // Zwei Beobachtungen im Februar: am Monatsende gilt die spätere.
    werte: [wert("2026-02-03", 200_000_00), wert("2026-02-25", 210_000_00)],
    verbindlichkeiten: [{ id: "v1", bezeichnung: "Darlehen", art: "immobilienkredit" }],
    staende: [stand("2026-02-25", 150_000_00)],
  };

  it("liefert je Monat das Monatsende und endet auf dem Bis-Tag", () => {
    const reihe = nettovermoegenVerlauf(e, "2026-01-15", "2026-03-10");
    expect(reihe.map((p) => p.stichtag)).toEqual(["2026-01-31", "2026-02-28", "2026-03-10"]);
  });

  it("rechnet jeden Punkt wie nettovermoegen", () => {
    const reihe = nettovermoegenVerlauf(e, "2026-01-01", "2026-03-10");
    expect(reihe[0].netto).toBe(1_500_00);
    expect(reihe[1].netto).toBe(1_500_00 + 210_000_00 - 150_000_00);
    expect(reihe[2]).toEqual(nettovermoegen(e, "2026-03-10"));
    expect(reihe[2].konten).toBe(1_400_00);
  });

  it("nimmt das Monatsende, wenn der Bis-Tag genau darauf fällt", () => {
    const reihe = nettovermoegenVerlauf(e, "2026-02-01", "2026-02-28");
    expect(reihe.map((p) => p.stichtag)).toEqual(["2026-02-28"]);
  });

  it("kennt den Schalttag", () => {
    const reihe = nettovermoegenVerlauf(LEER, "2024-02-01", "2024-03-31");
    expect(reihe.map((p) => p.stichtag)).toEqual(["2024-02-29", "2024-03-31"]);
  });

  it("ist leer, wenn der Zeitraum erst nach seinem Ende beginnt", () => {
    expect(nettovermoegenVerlauf(e, "2026-05-01", "2026-03-10")).toEqual([]);
  });

  it("weist ein Datum ab, das es nicht gibt", () => {
    expect(() => nettovermoegenVerlauf(e, "2026-02-31", "2026-03-10")).toThrow();
  });
});

describe("ersteBeobachtung", () => {
  it("findet den frühesten Stichtag über Werte und Restschulden", () => {
    expect(ersteBeobachtung([wert("2025-03-01", 1)], [stand("2024-11-30", 1)])).toBe("2024-11-30");
  });

  it("kennt ohne Beobachtung keinen", () => {
    expect(ersteBeobachtung([], [])).toBeUndefined();
  });
});
