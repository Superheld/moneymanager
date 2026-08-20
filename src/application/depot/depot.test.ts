// Übernahme und Sicht. Alle Werte erfunden; echt sind die Konstellationen: eine Bank ohne
// Gesamtwert, ein zweiter Abruf desselben Tages, und ein Papier ohne Einstandsangabe.

import { beforeEach, describe, expect, it } from "vitest";
import type { Depot, Depotposition, Depotwert } from "../../core";
import type { DepotRepository } from "../ports";
import type { Bankkonto, Depotbestand } from "../fints/abrufPort";
import { depotUebernehmen } from "./depotUebernehmen";
import { depotEntwicklung, depotsLaden } from "./depotsichten";

/** In-Memory-Fake des Ports — dieselbe Zusage, ohne SQLite. */
function fakeRepo(): DepotRepository & { stand: { depots: Depot[]; werte: Depotwert[]; positionen: Depotposition[] } } {
  const stand = { depots: [] as Depot[], werte: [] as Depotwert[], positionen: [] as Depotposition[] };
  return {
    stand,
    async alle() {
      return [...stand.depots];
    },
    async speichern(d) {
      stand.depots = [...stand.depots.filter((x) => x.id !== d.id), d];
    },
    async loeschen(id) {
      stand.depots = stand.depots.filter((d) => d.id !== id);
      stand.werte = stand.werte.filter((w) => w.depotId !== id);
      stand.positionen = stand.positionen.filter((p) => p.depotId !== id);
    },
    async werte(depotId) {
      return stand.werte.filter((w) => !depotId || w.depotId === depotId);
    },
    async wertSpeichern(w) {
      stand.werte = [
        ...stand.werte.filter((x) => !(x.depotId === w.depotId && x.stichtag === w.stichtag)),
        w,
      ];
    },
    async positionen(depotId, stichtag) {
      return stand.positionen.filter(
        (p) => p.depotId === depotId && (!stichtag || p.stichtag === stichtag),
      );
    },
    async positionenErsetzen(depotId, stichtag, positionen) {
      stand.positionen = [
        ...stand.positionen.filter((p) => !(p.depotId === depotId && p.stichtag === stichtag)),
        ...positionen,
      ];
    },
  };
}

const konto: Bankkonto = {
  nummer: "9876543210",
  unterkonto: "Depot",
  schluessel: "9876543210|Depot",
  bezeichnung: "Depot",
  waehrung: "EUR",
  kannSaldo: false,
  kannUmsaetze: false,
  kannDepot: true,
};

function bestand(over: Partial<Depotbestand> = {}): Depotbestand {
  return {
    stichtag: "2026-08-20",
    gesamtwert: 1_250_00,
    waehrung: "EUR",
    positionen: [
      { isin: "DE000TEST001", name: "Vibora Sammelanlage", stueck: 10, kurs: 87.65, wert: 876_50, einstandKurs: 60 },
      { isin: "DE000TEST002", name: "Ohlert Anteil", stueck: 5, kurs: 74.7, wert: 373_50 },
    ],
    hinweise: [],
    ...over,
  };
}

let repo: ReturnType<typeof fakeRepo>;
let nr: number;
const deps = () => ({ depotRepo: repo, id: () => `d${++nr}`, jetzt: "2026-08-20T10:00:00.000Z" });

beforeEach(() => {
  repo = fakeRepo();
  nr = 0;
});

describe("depotUebernehmen", () => {
  it("legt das Depot beim ersten Mal an", async () => {
    // Ohne Zutun des Nutzers: ein Depot wird mit keinem Konto der App verknüpft, weil es
    // keines ist — es gäbe nichts, wogegen man es abgleichen könnte.
    const u = await depotUebernehmen("z1", konto, bestand(), deps());
    expect(repo.stand.depots).toHaveLength(1);
    expect(repo.stand.depots[0].schluessel).toBe("9876543210|Depot");
    expect(u.positionen).toBe(2);
    expect(u.gesamtwert).toBe(1_250_00);
  });

  it("findet dasselbe Depot beim zweiten Abruf wieder", async () => {
    await depotUebernehmen("z1", konto, bestand(), deps());
    await depotUebernehmen("z1", konto, bestand({ stichtag: "2026-08-21" }), deps());
    expect(repo.stand.depots).toHaveLength(1);
    expect(repo.stand.werte).toHaveLength(2);
  });

  it("unterscheidet Depots über Nummer UND Unterkontomerkmal", async () => {
    // Institute führen Depot und Girokonto unter derselben Nummer. Über die Nummer allein
    // liefe man in genau die Verwechslung, gegen die dieser Schlüssel eingeführt wurde.
    await depotUebernehmen("z1", konto, bestand(), deps());
    await depotUebernehmen(
      "z1",
      { ...konto, unterkonto: "Depot 2", schluessel: "9876543210|Depot 2" },
      bestand(),
      deps(),
    );
    expect(repo.stand.depots).toHaveLength(2);
  });

  it("trägt keinen Wert ein, wo die Bank keinen nennt", async () => {
    // Eine Null hiesse „das Depot war an diesem Tag nichts wert" — eine Aussage, die
    // niemand gemacht hat, und die in jeder Verlaufskurve als Absturz erschiene.
    const u = await depotUebernehmen("z1", konto, bestand({ gesamtwert: undefined }), deps());
    expect(u.ohneGesamtwert).toBe(true);
    expect(repo.stand.werte).toHaveLength(0);
    // Die Positionen kommen trotzdem an.
    expect(repo.stand.positionen).toHaveLength(2);
  });

  it("gibt namenlosen Positionen eine eigene Kennung", async () => {
    const u = await depotUebernehmen(
      "z1",
      konto,
      bestand({ positionen: [{ wert: 100 }, { wert: 200 }] }),
      deps(),
    );
    expect(u.positionen).toBe(2);
    expect(repo.stand.positionen.map((p) => p.kennung)).toEqual(["#0", "#1"]);
  });

  it("ersetzt die Positionen eines Stichtags, statt sie zu ergänzen", async () => {
    await depotUebernehmen("z1", konto, bestand(), deps());
    await depotUebernehmen(
      "z1",
      konto,
      bestand({ positionen: [{ isin: "DE000TEST001", wert: 900_00 }] }),
      deps(),
    );
    const positionen = repo.stand.positionen.filter((p) => p.stichtag === "2026-08-20");
    expect(positionen).toHaveLength(1);
    expect(positionen[0].wert).toBe(900_00);
  });
});

describe("depotsLaden", () => {
  it("liefert nichts Auffälliges, solange es keine Depots gibt", async () => {
    const daten = await depotsLaden({ depotRepo: repo });
    expect(daten.hatDepots).toBe(false);
    expect(daten.gesamtwert).toBe(0);
  });

  it("nimmt je Depot den jüngsten Stand und summiert sie", async () => {
    await depotUebernehmen("z1", konto, bestand({ stichtag: "2026-07-31", gesamtwert: 100_000 }), deps());
    await depotUebernehmen("z1", konto, bestand({ stichtag: "2026-08-20", gesamtwert: 125_000 }), deps());
    const daten = await depotsLaden({ depotRepo: repo });
    expect(daten.depots).toHaveLength(1);
    expect(daten.depots[0].aktuell?.stichtag).toBe("2026-08-20");
    expect(daten.gesamtwert).toBe(125_000);
  });

  it("zeigt die Positionen des jüngsten Stichtags, nicht alle je gesehenen", async () => {
    await depotUebernehmen("z1", konto, bestand({ stichtag: "2026-07-31" }), deps());
    await depotUebernehmen(
      "z1",
      konto,
      bestand({ stichtag: "2026-08-20", positionen: [{ isin: "DE000TEST001", wert: 900_00 }] }),
      deps(),
    );
    const daten = await depotsLaden({ depotRepo: repo });
    expect(daten.depots[0].positionen).toHaveLength(1);
  });

  it("rechnet je Position das Ergebnis mit, wo ein Einstand bekannt ist", async () => {
    await depotUebernehmen("z1", konto, bestand(), deps());
    const daten = await depotsLaden({ depotRepo: repo });
    const [mitEinstand, ohneEinstand] = daten.depots[0].positionen;
    // 10 × 60 = 600,00 Einstand gegen 876,50 Wert.
    expect(mitEinstand.ergebnis.einstand).toBe(600_00);
    expect(mitEinstand.ergebnis.veraenderung).toBe(276_50);
    expect(ohneEinstand.ergebnis.veraenderung).toBeUndefined();
  });

  it("hält die Reihe aufsteigend, unabhängig von der Reihenfolge der Abrufe", async () => {
    await depotUebernehmen("z1", konto, bestand({ stichtag: "2026-08-20", gesamtwert: 300 }), deps());
    await depotUebernehmen("z1", konto, bestand({ stichtag: "2026-06-30", gesamtwert: 100 }), deps());
    const daten = await depotsLaden({ depotRepo: repo });
    expect(daten.depots[0].reihe.map((w) => w.stichtag)).toEqual(["2026-06-30", "2026-08-20"]);
  });
});

describe("depotEntwicklung", () => {
  async function reihe() {
    await depotUebernehmen("z1", konto, bestand({ stichtag: "2026-06-30", gesamtwert: 100_000 }), deps());
    await depotUebernehmen("z1", konto, bestand({ stichtag: "2026-08-20", gesamtwert: 125_000 }), deps());
    return (await depotsLaden({ depotRepo: repo })).depots[0];
  }

  it("misst vom ersten Stand IM Zeitraum, wenn davor keiner liegt", async () => {
    // Der Zeitraum der Analyse beginnt fast immer vor dem ersten Abruf. Mit der
    // Kern-Regel „was galt am 01.06." gäbe es dauerhaft keine Entwicklung zu sehen.
    const e = depotEntwicklung(await reihe(), "2026-06-01", "2026-08-31");
    expect(e.von?.stichtag).toBe("2026-06-30");
    expect(e.veraenderung).toBe(25_000);
  });

  it("nimmt den Stand von davor, wo es einen gibt", async () => {
    const e = depotEntwicklung(await reihe(), "2026-07-15", "2026-08-31");
    expect(e.von?.stichtag).toBe("2026-06-30");
    expect(e.veraenderung).toBe(25_000);
  });

  it("hält sich zurück, wo im Zeitraum überhaupt nichts liegt", async () => {
    const e = depotEntwicklung(await reihe(), "2025-01-01", "2025-12-31");
    expect(e.veraenderung).toBeUndefined();
  });
});
