// Pflege und Sicht des Vermögens. Alle Werte erfunden; echt sind die Konstellationen:
// ein Tippfehler, der am selben Stichtag korrigiert werden soll, ein Kredit, der auf ein
// gelöschtes Haus zeigt, und ein Konto, dessen Stand ein abgerufenes Depot ist.

import { describe, expect, it } from "vitest";
import {
  FachlicherFehler,
  type Depot,
  type Depotwert,
  type IstBuchung,
  type Verbindlichkeit,
  type Verbindlichkeitsstand,
  type Vermoegensgegenstand,
  type Vermoegenswert,
  type Vertrag,
  type Zahlungskonto,
} from "../../core";
import type { DepotRepository, LedgerPort, VermoegenRepository, VertragRepository, ZahlungskontoRepository } from "../ports";
import {
  restschuldEintragen,
  restschuldEntfernen,
  schuldAendern,
  schuldAnlegen,
  schuldFuehren,
  schuldLoeschen,
  vermoegenswertAendern,
  vermoegenswertAnlegen,
  vermoegenswertFuehren,
  vermoegenswertLoeschen,
  wertEintragen,
  wertEntfernen,
} from "./vermoegenPflege";
import { vermoegenLaden, type VermoegenDeps } from "./vermoegensichten";

const HEUTE = "2026-06-15";
const JETZT = "2026-06-15T09:00:00.000Z";

/** In-Memory-Fake des Ports — dieselbe Zusage wie SQLite, samt dem Schlüssel je Stichtag. */
function fakeVermoegen() {
  const stand = {
    gegenstaende: [] as Vermoegensgegenstand[],
    werte: [] as Vermoegenswert[],
    verbindlichkeiten: [] as Verbindlichkeit[],
    staende: [] as Verbindlichkeitsstand[],
  };
  const repo: VermoegenRepository = {
    gegenstaende: async () => [...stand.gegenstaende],
    gegenstandSpeichern: async (g) => {
      stand.gegenstaende = [...stand.gegenstaende.filter((x) => x.id !== g.id), g];
    },
    gegenstandLoeschen: async (id) => {
      stand.gegenstaende = stand.gegenstaende.filter((g) => g.id !== id);
      stand.werte = stand.werte.filter((w) => w.gegenstandId !== id);
      stand.verbindlichkeiten = stand.verbindlichkeiten.map((v) =>
        v.gegenstandId === id ? { ...v, gegenstandId: undefined } : v,
      );
    },
    werte: async () => [...stand.werte],
    wertEintragen: async (w) => {
      if (stand.werte.some((x) => x.gegenstandId === w.gegenstandId && x.stichtag === w.stichtag)) {
        throw new Error("UNIQUE constraint failed");
      }
      stand.werte.push(w);
    },
    wertEntfernen: async (gegenstandId, stichtag) => {
      stand.werte = stand.werte.filter((w) => !(w.gegenstandId === gegenstandId && w.stichtag === stichtag));
    },
    verbindlichkeiten: async () => [...stand.verbindlichkeiten],
    verbindlichkeitSpeichern: async (v) => {
      stand.verbindlichkeiten = [...stand.verbindlichkeiten.filter((x) => x.id !== v.id), v];
    },
    verbindlichkeitLoeschen: async (id) => {
      stand.verbindlichkeiten = stand.verbindlichkeiten.filter((v) => v.id !== id);
      stand.staende = stand.staende.filter((s) => s.verbindlichkeitId !== id);
    },
    staende: async () => [...stand.staende],
    standEintragen: async (s) => {
      if (stand.staende.some((x) => x.verbindlichkeitId === s.verbindlichkeitId && x.stichtag === s.stichtag)) {
        throw new Error("UNIQUE constraint failed");
      }
      stand.staende.push(s);
    },
    standEntfernen: async (verbindlichkeitId, stichtag) => {
      stand.staende = stand.staende.filter(
        (s) => !(s.verbindlichkeitId === verbindlichkeitId && s.stichtag === stichtag),
      );
    },
  };
  return { repo, stand };
}

function vertrag(id: string, anbieter: string): Vertrag {
  return { id, anbieter, beginn: "2024-01-01", verlaengerung: "keine", status: "aktiv" } as Vertrag;
}

function fakeVertraege(vertraege: Vertrag[] = []): VertragRepository {
  return { alle: async () => vertraege, speichern: async () => {}, loeschen: async () => {} };
}

function aufbau(vertraege: Vertrag[] = []) {
  const { repo, stand } = fakeVermoegen();
  return { deps: { vermoegenRepo: repo, vertragRepo: fakeVertraege(vertraege) }, stand };
}

/** Erwartet einen fachlichen Fehler mit genau diesem Schlüssel. */
async function erwarteFehler(tat: Promise<unknown>, code: string) {
  const fehler = await tat.then(
    () => null,
    (e: unknown) => e,
  );
  expect(fehler).toBeInstanceOf(FachlicherFehler);
  expect((fehler as FachlicherFehler).code).toBe(code);
}

describe("Vermögenswert pflegen", () => {
  it("legt an und führt ihn von Anfang an", async () => {
    const { deps, stand } = aufbau();
    const g = await vermoegenswertAnlegen(deps, { bezeichnung: "  Wohnung Lindenhof  ", art: "immobilie" });
    expect(stand.gegenstaende).toEqual([{ id: g.id, bezeichnung: "Wohnung Lindenhof", art: "immobilie", aktiv: true }]);
  });

  it("weist eine leere Bezeichnung und eine unbekannte Art ab", async () => {
    const { deps, stand } = aufbau();
    await erwarteFehler(vermoegenswertAnlegen(deps, { bezeichnung: "   ", art: "immobilie" }), "bezeichnung.fehlt");
    await erwarteFehler(
      vermoegenswertAnlegen(deps, { bezeichnung: "Etwas", art: "schmuck" as never }),
      "vermoegen.artUnbekannt",
    );
    expect(stand.gegenstaende).toHaveLength(0);
  });

  it("ändert am selben Eintrag und lässt die Stilllegung stehen", async () => {
    const { deps, stand } = aufbau();
    const g = await vermoegenswertAnlegen(deps, { bezeichnung: "Transporter", art: "fahrzeug" });
    await vermoegenswertFuehren(deps, g.id, false);
    await vermoegenswertAendern(deps, g.id, { bezeichnung: "Transporter (alt)", art: "sonstiges" });
    expect(stand.gegenstaende).toEqual([{ id: g.id, bezeichnung: "Transporter (alt)", art: "sonstiges", aktiv: false }]);
  });

  it("nimmt einen stillgelegten wieder auf", async () => {
    const { deps, stand } = aufbau();
    const g = await vermoegenswertAnlegen(deps, { bezeichnung: "Transporter", art: "fahrzeug" });
    await vermoegenswertFuehren(deps, g.id, false);
    await vermoegenswertFuehren(deps, g.id, true);
    expect(stand.gegenstaende[0].aktiv).toBe(true);
  });

  it("kennt keinen Eintrag, den es nicht gibt", async () => {
    const { deps } = aufbau();
    await erwarteFehler(vermoegenswertAendern(deps, "weg", { bezeichnung: "X", art: "sonstiges" }), "vermoegen.unbekannt");
    await erwarteFehler(vermoegenswertFuehren(deps, "weg", false), "vermoegen.unbekannt");
  });

  it("löscht ihn samt seiner Wertreihe", async () => {
    const { deps, stand } = aufbau();
    const g = await vermoegenswertAnlegen(deps, { bezeichnung: "Anteil Werkhof", art: "beteiligung" });
    await wertEintragen(deps, g.id, { stichtag: "2025-12-31", betrag: 8_000_00 }, HEUTE, JETZT);
    await vermoegenswertLoeschen(deps, g.id);
    expect(stand.gegenstaende).toHaveLength(0);
    expect(stand.werte).toHaveLength(0);
  });
});

describe("Wert eintragen", () => {
  it("trägt eine Beobachtung ein", async () => {
    const { deps, stand } = aufbau();
    const g = await vermoegenswertAnlegen(deps, { bezeichnung: "Police Nordlicht", art: "versicherung" });
    await wertEintragen(deps, g.id, { stichtag: "2025-12-31", betrag: 14_250_00 }, HEUTE, JETZT);
    expect(stand.werte).toEqual([{ gegenstandId: g.id, stichtag: "2025-12-31", wert: 14_250_00 }]);
  });

  it("überschreibt einen belegten Stichtag nicht", async () => {
    const { deps, stand } = aufbau();
    const g = await vermoegenswertAnlegen(deps, { bezeichnung: "Police Nordlicht", art: "versicherung" });
    await wertEintragen(deps, g.id, { stichtag: "2025-12-31", betrag: 14_250_00 }, HEUTE, JETZT);
    await erwarteFehler(
      wertEintragen(deps, g.id, { stichtag: "2025-12-31", betrag: 14_520_00 }, HEUTE, JETZT),
      "vermoegen.stichtagBelegt",
    );
    expect(stand.werte[0].wert).toBe(14_250_00);
  });

  it("lässt den Tippfehler entfernen und neu eintragen", async () => {
    const { deps, stand } = aufbau();
    const g = await vermoegenswertAnlegen(deps, { bezeichnung: "Police Nordlicht", art: "versicherung" });
    await wertEintragen(deps, g.id, { stichtag: "2025-12-31", betrag: 14_250_00 }, HEUTE, JETZT);
    await wertEntfernen(deps, g.id, "2025-12-31");
    await wertEintragen(deps, g.id, { stichtag: "2025-12-31", betrag: 14_520_00 }, HEUTE, JETZT);
    expect(stand.werte).toEqual([{ gegenstandId: g.id, stichtag: "2025-12-31", wert: 14_520_00 }]);
  });

  it("nimmt null an, aber nichts Negatives und keinen Bruchteil", async () => {
    const { deps, stand } = aufbau();
    const g = await vermoegenswertAnlegen(deps, { bezeichnung: "Anhänger", art: "fahrzeug" });
    await wertEintragen(deps, g.id, { stichtag: "2026-01-31", betrag: 0 }, HEUTE, JETZT);
    await erwarteFehler(wertEintragen(deps, g.id, { stichtag: "2026-02-28", betrag: -1 }, HEUTE, JETZT), "vermoegen.wertUngueltig");
    await erwarteFehler(wertEintragen(deps, g.id, { stichtag: "2026-02-28", betrag: 10.5 }, HEUTE, JETZT), "vermoegen.wertUngueltig");
    expect(stand.werte).toHaveLength(1);
  });

  it("weist einen Stichtag ab, den es nicht gibt oder der noch kommt", async () => {
    const { deps } = aufbau();
    const g = await vermoegenswertAnlegen(deps, { bezeichnung: "Anhänger", art: "fahrzeug" });
    await erwarteFehler(wertEintragen(deps, g.id, { stichtag: "31.12.2025", betrag: 1 }, HEUTE, JETZT), "datum.ungueltig");
    await erwarteFehler(wertEintragen(deps, g.id, { stichtag: "2026-02-31", betrag: 1 }, HEUTE, JETZT), "datum.ungueltig");
    await erwarteFehler(wertEintragen(deps, g.id, { stichtag: "2026-06-16", betrag: 1 }, HEUTE, JETZT), "vermoegen.stichtagZukunft");
  });

  it("trägt nichts für einen Vermögenswert ein, den es nicht gibt", async () => {
    const { deps, stand } = aufbau();
    await erwarteFehler(wertEintragen(deps, "weg", { stichtag: "2026-01-31", betrag: 1 }, HEUTE, JETZT), "vermoegen.unbekannt");
    expect(stand.werte).toHaveLength(0);
  });
});

describe("Schuld pflegen", () => {
  it("speichert die Verweise auf Vertrag und Vermögenswert", async () => {
    const { deps, stand } = aufbau([vertrag("ver1", "Talmberger Bank")]);
    const g = await vermoegenswertAnlegen(deps, { bezeichnung: "Wohnung Lindenhof", art: "immobilie" });
    const v = await schuldAnlegen(deps, {
      bezeichnung: "Darlehen Lindenhof",
      art: "immobilienkredit",
      vertragId: "ver1",
      gegenstandId: g.id,
    });
    expect(stand.verbindlichkeiten).toEqual([
      { id: v.id, bezeichnung: "Darlehen Lindenhof", art: "immobilienkredit", vertragId: "ver1", gegenstandId: g.id, aktiv: true },
    ]);
  });

  it("liest eine leere Wahl als kein Verweis", async () => {
    const { deps, stand } = aufbau();
    await schuldAnlegen(deps, { bezeichnung: "Geliehen von Ohlert", art: "privat", vertragId: "", gegenstandId: "" });
    expect(stand.verbindlichkeiten[0].vertragId).toBeUndefined();
    expect(stand.verbindlichkeiten[0].gegenstandId).toBeUndefined();
  });

  it("weist einen Verweis ins Leere ab", async () => {
    const { deps, stand } = aufbau();
    await erwarteFehler(
      schuldAnlegen(deps, { bezeichnung: "Darlehen", art: "ratenkredit", vertragId: "gibt-es-nicht" }),
      "vermoegen.verweisUnbekannt",
    );
    await erwarteFehler(
      schuldAnlegen(deps, { bezeichnung: "Darlehen", art: "ratenkredit", gegenstandId: "gibt-es-nicht" }),
      "vermoegen.verweisUnbekannt",
    );
    await erwarteFehler(schuldAnlegen(deps, { bezeichnung: "Darlehen", art: "leasing" as never }), "vermoegen.artUnbekannt");
    expect(stand.verbindlichkeiten).toHaveLength(0);
  });

  it("ändert, legt still und löscht samt Reihe", async () => {
    const { deps, stand } = aufbau();
    const v = await schuldAnlegen(deps, { bezeichnung: "Ratenkauf", art: "ratenkredit" });
    await restschuldEintragen(deps, v.id, { stichtag: "2025-12-31", betrag: 3_000_00 }, HEUTE, JETZT);
    await schuldFuehren(deps, v.id, false);
    await schuldAendern(deps, v.id, { bezeichnung: "Ratenkauf Küche", art: "sonstiges" });
    expect(stand.verbindlichkeiten[0]).toMatchObject({ bezeichnung: "Ratenkauf Küche", art: "sonstiges", aktiv: false });

    await schuldLoeschen(deps, v.id);
    expect(stand.verbindlichkeiten).toHaveLength(0);
    expect(stand.staende).toHaveLength(0);
  });

  it("verliert beim Löschen des Vermögenswerts nur den Verweis", async () => {
    const { deps, stand } = aufbau();
    const g = await vermoegenswertAnlegen(deps, { bezeichnung: "Wohnung Lindenhof", art: "immobilie" });
    await schuldAnlegen(deps, { bezeichnung: "Darlehen Lindenhof", art: "immobilienkredit", gegenstandId: g.id });
    await vermoegenswertLoeschen(deps, g.id);
    expect(stand.verbindlichkeiten).toHaveLength(1);
    expect(stand.verbindlichkeiten[0].gegenstandId).toBeUndefined();
  });
});

describe("Restschuld eintragen", () => {
  it("trägt ein, weist den belegten Stichtag ab und lässt entfernen", async () => {
    const { deps, stand } = aufbau();
    const v = await schuldAnlegen(deps, { bezeichnung: "Ratenkauf", art: "ratenkredit" });
    await restschuldEintragen(deps, v.id, { stichtag: "2025-12-31", betrag: 3_000_00 }, HEUTE, JETZT);
    await erwarteFehler(
      restschuldEintragen(deps, v.id, { stichtag: "2025-12-31", betrag: 2_900_00 }, HEUTE, JETZT),
      "vermoegen.stichtagBelegt",
    );
    expect(stand.staende).toEqual([{ verbindlichkeitId: v.id, stichtag: "2025-12-31", restschuld: 3_000_00 }]);

    await restschuldEntfernen(deps, v.id, "2025-12-31");
    expect(stand.staende).toHaveLength(0);
  });

  it("hält die Restschuld positiv", async () => {
    const { deps } = aufbau();
    const v = await schuldAnlegen(deps, { bezeichnung: "Ratenkauf", art: "ratenkredit" });
    await erwarteFehler(
      restschuldEintragen(deps, v.id, { stichtag: "2025-12-31", betrag: -3_000_00 }, HEUTE, JETZT),
      "vermoegen.restschuldUngueltig",
    );
    await erwarteFehler(
      restschuldEintragen(deps, "weg", { stichtag: "2025-12-31", betrag: 1 }, HEUTE, JETZT),
      "vermoegen.unbekannt",
    );
    await erwarteFehler(
      restschuldEintragen(deps, v.id, { stichtag: "2026-07-01", betrag: 1 }, HEUTE, JETZT),
      "vermoegen.stichtagZukunft",
    );
  });
});

describe("vermoegenLaden", () => {
  function sichtDeps(over: {
    konten?: Zahlungskonto[];
    buchungen?: IstBuchung[];
    depots?: Depot[];
    depotwerte?: Depotwert[];
    vertraege?: Vertrag[];
    zuordnungen?: { zugangId: string; schluessel: string; zahlungskontoId: string }[];
  } = {}) {
    const { repo, stand } = fakeVermoegen();
    const deps: VermoegenDeps = {
      vermoegenRepo: repo,
      vertragRepo: fakeVertraege(over.vertraege ?? []),
      kontoRepo: { alle: async () => over.konten ?? [] } as unknown as ZahlungskontoRepository,
      ledger: { alle: async () => over.buchungen ?? [] } as unknown as LedgerPort,
      depotRepo: {
        alle: async () => over.depots ?? [],
        werte: async () => over.depotwerte ?? [],
      } as unknown as DepotRepository,
      kontozuordnungen: over.zuordnungen ? async () => over.zuordnungen! : undefined,
    };
    return { deps, stand };
  }

  const giro: Zahlungskonto = { id: "giro", bezeichnung: "Giro", typ: "Giro", klasse: "liquide", inhaberIds: [], saldo: 2_000_00 };

  it("zeigt ohne Einträge den Stand aus Konten und Depots und keinen Verlauf", async () => {
    const { deps } = sichtDeps({
      konten: [giro],
      depotwerte: [{ depotId: "d1", stichtag: "2026-06-01", gesamtwert: 5_000_00 }],
    });
    const sicht = await vermoegenLaden(deps, HEUTE);
    expect(sicht.netto).toMatchObject({ konten: 2_000_00, depots: 5_000_00, vermoegenswerte: 0, schulden: 0, netto: 7_000_00 });
    expect(sicht.verlauf).toEqual([]);
    expect(sicht.vermoegenswerte).toEqual([]);
    expect(sicht.schulden).toEqual([]);
  });

  it("führt je Eintrag die Reihe, jüngste zuerst, und rechnet das Nettovermögen", async () => {
    const { deps } = sichtDeps({ konten: [giro], vertraege: [vertrag("ver1", "Talmberger Bank")] });
    const pflege = { vermoegenRepo: deps.vermoegenRepo, vertragRepo: deps.vertragRepo };
    const g = await vermoegenswertAnlegen(pflege, { bezeichnung: "Wohnung Lindenhof", art: "immobilie" });
    await wertEintragen(pflege, g.id, { stichtag: "2024-12-31", betrag: 240_000_00 }, HEUTE, JETZT);
    await wertEintragen(pflege, g.id, { stichtag: "2025-12-31", betrag: 250_000_00 }, HEUTE, JETZT);
    const v = await schuldAnlegen(pflege, {
      bezeichnung: "Darlehen Lindenhof", art: "immobilienkredit", vertragId: "ver1", gegenstandId: g.id,
    });
    await restschuldEintragen(pflege, v.id, { stichtag: "2025-12-31", betrag: 170_000_00 }, HEUTE, JETZT);

    const sicht = await vermoegenLaden(deps, HEUTE);
    expect(sicht.vermoegenswerte[0].aktuell).toEqual({ stichtag: "2025-12-31", betrag: 250_000_00 });
    expect(sicht.vermoegenswerte[0].reihe.map((b) => b.stichtag)).toEqual(["2025-12-31", "2024-12-31"]);
    expect(sicht.schulden[0]).toMatchObject({
      aktuell: { stichtag: "2025-12-31", betrag: 170_000_00 },
      vertragName: "Talmberger Bank",
      gegenstandName: "Wohnung Lindenhof",
    });
    expect(sicht.netto.netto).toBe(2_000_00 + 250_000_00 - 170_000_00);
    expect(sicht.vertraege).toEqual([{ id: "ver1", name: "Talmberger Bank" }]);

    // Der Verlauf beginnt im Monat der ersten Beobachtung und endet auf dem Stand von heute.
    expect(sicht.verlauf[0].stichtag).toBe("2024-12-31");
    expect(sicht.verlauf[0].netto).toBe(2_000_00 + 240_000_00);
    expect(sicht.verlauf[sicht.verlauf.length - 1]).toEqual(sicht.netto);
  });

  it("zeigt einen stillgelegten Eintrag weiter, zählt ihn aber nicht mehr", async () => {
    const { deps } = sichtDeps();
    const pflege = { vermoegenRepo: deps.vermoegenRepo, vertragRepo: deps.vertragRepo };
    const g = await vermoegenswertAnlegen(pflege, { bezeichnung: "Transporter", art: "fahrzeug" });
    await wertEintragen(pflege, g.id, { stichtag: "2025-12-31", betrag: 9_000_00 }, HEUTE, JETZT);
    await vermoegenswertFuehren(pflege, g.id, false);

    const sicht = await vermoegenLaden(deps, HEUTE);
    expect(sicht.vermoegenswerte[0].gefuehrt).toBe(false);
    expect(sicht.vermoegenswerte[0].aktuell?.betrag).toBe(9_000_00);
    expect(sicht.netto.vermoegenswerte).toBe(0);
    expect(sicht.verlauf[0].vermoegenswerte).toBe(9_000_00);
  });

  it("zählt ein Konto, dessen Stand ein abgerufenes Depot ist, nur als Depot", async () => {
    const depotkonto: Zahlungskonto = {
      id: "dk", bezeichnung: "Depotkonto", typ: "Depot", klasse: "investment", inhaberIds: [], saldo: 4_000_00,
    };
    const { deps } = sichtDeps({
      konten: [giro, depotkonto],
      depots: [{ id: "d1", zugangId: "z1", schluessel: "s1", bezeichnung: "Depot" }],
      depotwerte: [{ depotId: "d1", stichtag: "2026-06-01", gesamtwert: 5_000_00 }],
      zuordnungen: [{ zugangId: "z1", schluessel: "s1", zahlungskontoId: "dk" }],
    });
    const sicht = await vermoegenLaden(deps, HEUTE);
    expect(sicht.netto.konten).toBe(2_000_00);
    expect(sicht.netto.depots).toBe(5_000_00);
  });

  it("begrenzt den Verlauf auf zehn Jahre", async () => {
    const { deps } = sichtDeps();
    const pflege = { vermoegenRepo: deps.vermoegenRepo, vertragRepo: deps.vertragRepo };
    const g = await vermoegenswertAnlegen(pflege, { bezeichnung: "Wohnung Lindenhof", art: "immobilie" });
    await wertEintragen(pflege, g.id, { stichtag: "2001-12-31", betrag: 100_000_00 }, HEUTE, JETZT);
    const sicht = await vermoegenLaden(deps, HEUTE);
    expect(sicht.verlauf).toHaveLength(120);
    expect(sicht.verlauf[0].stichtag).toBe("2016-07-31");
  });
});
