/** @vitest-environment jsdom */
// Die Profilkarte: was die Bank über sich sagt, in lesbarer Form.
//
// Alle Werte hier sind erfunden. Was echt ist, ist die Konstellation: eine Bank, die für
// zwei Umsatzformate verschiedene Speicherzeiträume nennt, ein Vorfall ohne jede Angabe,
// und ein TAN-Verfahren, das in der Banking-App freigegeben wird.

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Database } from "sql.js";

// Der Provider um jeden gerenderten Baum lädt Locale und Währung aus der Datenbank. Die
// Karte braucht davon nichts, gerendert wird sie ohne trotzdem nicht.
const halter = vi.hoisted(() => {
  let aktuell: unknown = null;
  return { setzen: (d: unknown) => (aktuell = d), lesen: () => aktuell };
});
vi.mock("../../persistence/db", () => ({ getDb: async () => halter.lesen() }));

import type { Bankprofil, Bankzugang } from "../../../application";
import { frischeDb, pluginApi, rendere, sqlLaden } from "../../../testwerkzeug/harness";
import { Bankprofilkarte } from "./Bankprofilkarte";

let db: Database;

beforeAll(sqlLaden);
beforeEach(() => {
  db?.close();
  db = frischeDb();
  halter.setzen(pluginApi(db));
});

/** Rendert und wartet, bis der Provider seine Kinder freigibt. */
async function zeige(element: Parameters<typeof rendere>[0]) {
  rendere(element);
  await waitFor(() => {
    if (!document.body.textContent) throw new Error("noch nichts gerendert");
  });
}

const zugang: Bankzugang = {
  id: "z1",
  bezeichnung: "Kesselmann Bank",
  art: "fints",
  url: "https://fints.example/fints",
  blz: "99999901",
  benutzer: "10203040",
};

const profil: Bankprofil = {
  standAm: "2026-08-20",
  tanVerfahren: [
    { id: 900, name: "Bildfreigabe", decoupled: false, mediumPflicht: true, medien: ["Lesegerät 1"] },
    { id: 901, name: "App-Freigabe", decoupled: true, mediumPflicht: false, medien: [] },
  ],
  vorfaelle: [
    { segment: "HKSAL", version: 7 },
    {
      segment: "HKCAZ",
      version: 1,
      speicherzeitraumTage: 400,
      formate: ["urn:iso:std:iso:20022:tech:xsd:camt.052.001.08"],
    },
    { segment: "HKKAZ", version: 7, speicherzeitraumTage: 90, alleKontenAmStueck: true },
    { segment: "HKWPD", version: 6, kursqualitaetWaehlbar: true, waehrungWaehlbar: true },
  ],
  kontoVorfaelle: {},
  nationaleFelderErlaubt: false,
};

function zeile(name: string) {
  return screen.getByText(name).closest("tr") as HTMLElement;
}

describe("Bankprofilkarte", () => {
  it("nennt jeden Vorgang im Klartext und behält das Segment als Beleg", async () => {
    // „HKCAZ" liest sich ohne Klartext wie eine Fehlermeldung; ohne das Kürzel wiederum
    // lässt sich keine Bankrückmeldung mehr damit in Verbindung bringen.
    await zeige(<Bankprofilkarte zugang={zugang} profil={profil} />);
    expect(within(zeile("Umsätze (CAMT)")).getByText("HKCAZ")).toBeInTheDocument();
    expect(screen.getByText("Depotaufstellung")).toBeInTheDocument();
  });

  it("zeigt die Speicherzeiträume je Format getrennt", async () => {
    // Die beiden Wege haben verschiedene Grenzen. Ein einzelner Wert verschweigt, welcher
    // Weg die längere Geschichte hergibt — und genau das entscheidet den Erstabruf.
    await zeige(<Bankprofilkarte zugang={zugang} profil={profil} />);
    expect(within(zeile("Umsätze (CAMT)")).getByText("400 Tage")).toBeInTheDocument();
    expect(within(zeile("Umsätze (MT940)")).getByText("90 Tage")).toBeInTheDocument();
  });

  it("meldet fehlende Angaben als solche, statt eine Null zu erfinden", async () => {
    // Nicht „0 Tage": ein ungesetztes Feld ist keine Grenze.
    await zeige(<Bankprofilkarte zugang={zugang} profil={profil} />);
    expect(within(zeile("Kontostand")).getByText("ohne Angabe")).toBeInTheDocument();
  });

  it("kürzt die CAMT-Kennung auf den Teil, der einen Unterschied macht", async () => {
    await zeige(<Bankprofilkarte zugang={zugang} profil={profil} />);
    expect(screen.getByText(/camt\.052\.001\.08/)).toBeInTheDocument();
    expect(screen.queryByText(/urn:iso:std/)).not.toBeInTheDocument();
  });

  it("erklärt, warum CAMT bei dieser Bank besonders ist", async () => {
    await zeige(<Bankprofilkarte zugang={zugang} profil={profil} />);
    expect(screen.getByText(/nationalen Kontofelder/)).toBeInTheDocument();
  });

  it("markiert das benutzte TAN-Verfahren und bietet die anderen an", async () => {
    const mitVerfahren = { ...zugang, tanVerfahrenId: 900 };
    const gewaehlt = vi.fn();
    await zeige(<Bankprofilkarte zugang={mitVerfahren} profil={profil} onTanVerfahren={gewaehlt} />);

    const aktiv = screen.getByText("Bildfreigabe").closest("li") as HTMLElement;
    expect(within(aktiv).getByText("in Benutzung")).toBeInTheDocument();
    // Das aktive Verfahren bekommt keinen Knopf — es ist schon gewählt.
    expect(within(aktiv).queryByRole("button")).not.toBeInTheDocument();

    const andere = screen.getByText("App-Freigabe").closest("li") as HTMLElement;
    expect(within(andere).getByText("Freigabe in der App")).toBeInTheDocument();
  });

  it("reicht die Wahl eines Verfahrens nach oben", async () => {
    const gewaehlt = vi.fn();
    await zeige(<Bankprofilkarte zugang={zugang} profil={profil} onTanVerfahren={gewaehlt} />);
    const andere = screen.getByText("App-Freigabe").closest("li") as HTMLElement;
    await userEvent.click(within(andere).getByRole("button", { name: "Dieses Verfahren benutzen" }));
    expect(gewaehlt).toHaveBeenCalledWith(901);
  });

  it("zeigt ohne Rückruf keine Auswahlknöpfe", async () => {
    // Die Karte wird auch für ein gespeichertes Profil gerendert; dort ist Wählen nicht
    // vorgesehen, und ein Knopf, der nichts tut, ist schlimmer als keiner.
    await zeige(<Bankprofilkarte zugang={zugang} profil={profil} />);
    expect(screen.queryByRole("button", { name: "Dieses Verfahren benutzen" })).not.toBeInTheDocument();
  });
});
