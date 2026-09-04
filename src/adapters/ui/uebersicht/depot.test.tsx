/** @vitest-environment jsdom */
// Die beiden Depot-Ansichten: der Stand in der Übersicht, die Entwicklung in der Analyse.
//
// Alle Zahlen erfunden. Echt ist die Konstellation: ein Papier mit Einstandsangabe, eines
// ohne (von einer anderen Bank übertragen), und eine Reihe mit genau zwei Ständen.

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import type { Database } from "sql.js";

const halter = vi.hoisted(() => {
  let aktuell: unknown = null;
  return { setzen: (d: unknown) => (aktuell = d), lesen: () => aktuell };
});
vi.mock("../../persistence/db", () => ({ getDb: async () => halter.lesen() }));

import type { Depotdaten, Depotsicht } from "../../../application";
import { frischeDb, pluginApi, rendere, sqlLaden } from "../../../testwerkzeug/harness";
import { DepotKarte } from "./DepotKarte";
import { DepotAnsicht } from "../analyse/DepotAnsicht";
import { DepotAuszug } from "../konten/DepotAuszug";

let db: Database;

beforeAll(sqlLaden);
beforeEach(() => {
  db?.close();
  db = frischeDb();
  halter.setzen(pluginApi(db));
});

async function zeige(element: Parameters<typeof rendere>[0]) {
  rendere(element);
  await waitFor(() => {
    if (!document.body.textContent) throw new Error("noch nichts gerendert");
  });
}

const sicht: Depotsicht = {
  depot: { id: "d1", zugangId: "z1", schluessel: "9876543210|Depot", bezeichnung: "Depot", waehrung: "EUR" },
  aktuell: { depotId: "d1", stichtag: "2026-08-20", gesamtwert: 125_000 },
  reihe: [
    { depotId: "d1", stichtag: "2026-06-30", gesamtwert: 100_000 },
    { depotId: "d1", stichtag: "2026-08-20", gesamtwert: 125_000 },
  ],
  positionen: [
    {
      depotId: "d1",
      stichtag: "2026-08-20",
      kennung: "DE000TEST001",
      isin: "DE000TEST001",
      name: "Vibora Sammelanlage",
      stueck: 10,
      kurs: 87.65,
      wert: 876_50,
      einstandKurs: 60,
      ergebnis: { einstand: 600_00, wert: 876_50, veraenderung: 276_50, anteil: 0.4608 },
    },
    {
      depotId: "d1",
      stichtag: "2026-08-20",
      kennung: "DE000TEST002",
      isin: "DE000TEST002",
      name: "Ohlert Anteil",
      stueck: 5,
      wert: 373_50,
      ergebnis: { wert: 373_50 },
    },
  ],
};

const daten: Depotdaten = { depots: [sicht], gesamtwert: 125_000, hatDepots: true };

describe("DepotKarte (Übersicht)", () => {
  it("zeigt gar nichts, solange es kein Depot gibt", async () => {
    // Eine leere Karte mit einer Null liest sich wie ein Fehler. Der Marker daneben ist
    // nötig, weil sonst gar nichts rendert und der Test nicht vom Provider freikommt.
    await zeige(
      <>
        <span>marker</span>
        <DepotKarte daten={{ depots: [], gesamtwert: 0, hatDepots: false }} />
      </>,
    );
    expect(screen.getByText("marker")).toBeInTheDocument();
    expect(screen.queryByText("Depots")).not.toBeInTheDocument();
  });

  it("nennt den Stand immer mit seinem Stichtag", async () => {
    // Ohne Datum ist ein Depotwert eine Behauptung ohne Zeitbezug — und je länger der
    // letzte Abruf her ist, desto weniger sagt er über heute.
    await zeige(<DepotKarte daten={daten} />);
    expect(screen.getByText(/Stand 20\.08\.2026/)).toBeInTheDocument();
  });

  it("sagt ausdrücklich, dass das nicht zu den liquiden Mitteln zählt", async () => {
    await zeige(<DepotKarte daten={daten} />);
    expect(screen.getByText(/nicht in den liquiden mitteln/i)).toBeInTheDocument();
  });

  it("zeigt die Veränderung zum vorletzten Stand", async () => {
    await zeige(<DepotKarte daten={daten} />);
    expect(screen.getByText(/seit 30\.06\.2026/)).toBeInTheDocument();
  });

  it("listet die Positionen mit ihrem Wert", async () => {
    // Der Gesamtwert allein beantwortet „wieviel", nicht „was drin liegt". Beides steht
    // in derselben Karte, weil die Frage in der Übersicht meist beides zugleich ist.
    await zeige(<DepotKarte daten={daten} />);
    expect(screen.getByText("Vibora Sammelanlage")).toBeInTheDocument();
    expect(screen.getByText("Ohlert Anteil")).toBeInTheDocument();
  });

  it("zeigt keine Positionsliste, wo die Bank keine gemeldet hat", async () => {
    const ohne: Depotsicht = { ...sicht, positionen: [] };
    await zeige(<DepotKarte daten={{ depots: [ohne], gesamtwert: 125_000, hatDepots: true }} />);
    expect(screen.queryByText("Vibora Sammelanlage")).not.toBeInTheDocument();
  });

  it("meldet ein nie abgerufenes Depot als solches, statt eine Null zu zeigen", async () => {
    const nie: Depotsicht = { depot: sicht.depot, reihe: [], positionen: [] };
    await zeige(<DepotKarte daten={{ depots: [nie], gesamtwert: 0, hatDepots: true }} />);
    expect(screen.getByText("noch nie abgerufen")).toBeInTheDocument();
  });
});

describe("DepotAnsicht (Analyse)", () => {
  it("nennt die Entwicklung und dass sie keine Rendite ist", async () => {
    // Zukäufe und Entnahmen stecken mit drin und sind aus den Beständen allein nicht
    // herauszurechnen. Das gehört dazugesagt, nicht in eine Fussnote.
    await zeige(<DepotAnsicht sicht={sicht} von="2026-06-01" bis="2026-08-31" />);
    expect(screen.getByText(/keine Rendite/)).toBeInTheDocument();
  });

  it("listet die Positionen mit ihrer Kennung", async () => {
    await zeige(<DepotAnsicht sicht={sicht} von="2026-06-01" bis="2026-08-31" />);
    expect(screen.getByText("DE000TEST001")).toBeInTheDocument();
    expect(screen.getByText("Vibora Sammelanlage")).toBeInTheDocument();
  });

  it("lässt das Ergebnis leer, wo die Bank keinen Einstand nennt", async () => {
    // Eine Null stünde dort für „keine Veränderung" und wäre falsch.
    await zeige(<DepotAnsicht sicht={sicht} von="2026-06-01" bis="2026-08-31" />);
    const zeile = screen.getByText("Ohlert Anteil").closest("tr") as HTMLElement;
    const zellen = within(zeile).getAllByRole("cell");
    // Die letzte Spalte ist „seit Kauf". Ohne Einstand steht dort nichts — und die
    // Spalte davor (Wert) ist trotzdem gefüllt: die Position ist ja etwas wert.
    expect(zellen[zellen.length - 1].textContent).toBe("—");
    expect(zellen[zellen.length - 2].textContent).not.toBe("—");
  });

  it("verlangt für einen Verlauf mindestens zwei Stände im Zeitraum", async () => {
    await zeige(<DepotAnsicht sicht={sicht} von="2026-08-01" bis="2026-08-31" />);
    expect(screen.getByText(/mindestens zwei Stände/)).toBeInTheDocument();
  });
});

describe("DepotAuszug (Konto)", () => {
  const konto = {
    id: "k-depot",
    bezeichnung: "Depot",
    typ: "Depot" as const,
    klasse: "vorsorge" as const,
    inhaberIds: [],
    saldo: 0,
  };

  it("zeigt den Depotwert statt des Kontostands", async () => {
    // Der eigentliche Anlass: das Konto hat Saldo 0, weil es keine Buchungen gibt — und
    // zeigte deshalb eine Null, während der Wert eine Tabelle weiter danebenlag.
    await zeige(<DepotAuszug konto={konto} sicht={sicht} />);
    expect(screen.getByText(/1\.250,00|1,250\.00/)).toBeInTheDocument();
  });

  it("nennt den Stichtag zur Zahl", async () => {
    await zeige(<DepotAuszug konto={konto} sicht={sicht} />);
    expect(screen.getByText(/20\.08\.2026/)).toBeInTheDocument();
  });

  it("erklärt, warum hier keine Buchungen stehen", async () => {
    // Eine leere Auszugsliste liest sich wie ein Fehler. Der Satz sagt, wo die Bewegungen
    // wirklich sind.
    await zeige(<DepotAuszug konto={konto} sicht={sicht} />);
    expect(screen.getByText(/Verrechnungskonto/)).toBeInTheDocument();
  });

  it("listet die Positionen", async () => {
    await zeige(<DepotAuszug konto={konto} sicht={sicht} />);
    expect(screen.getByText("Vibora Sammelanlage")).toBeInTheDocument();
    expect(screen.getByText("Ohlert Anteil")).toBeInTheDocument();
  });

  it("kommt mit einem nie abgerufenen Depot zurecht", async () => {
    const leer = { depot: sicht.depot, reihe: [], positionen: [] };
    await zeige(<DepotAuszug konto={konto} sicht={leer} />);
    expect(screen.getByText("noch nie abgerufen")).toBeInTheDocument();
  });
});
