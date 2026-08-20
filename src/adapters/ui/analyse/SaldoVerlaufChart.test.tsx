/** @vitest-environment jsdom */
// Der Saldo-Verlauf war nie gerendert worden — 0 % Deckung.
//
// Ein Chart bricht anders als eine Liste: er wirft nicht, er zeichnet Unsinn. Die Fälle,
// die dabei zuerst danebengehen, sind die entarteten — eine einzige Stützstelle (keine
// Spanne, Division durch null) und ein durchweg gleicher Wert (Wertebereich null).

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "sql.js";

const halter = vi.hoisted(() => {
  let aktuell: unknown = null;
  return { setzen: (d: unknown) => (aktuell = d), lesen: () => aktuell };
});
vi.mock("../../persistence/db", () => ({ getDb: async () => halter.lesen() }));

import { waitFor } from "@testing-library/react";
import { frischeDb, pluginApi, rendere, sqlLaden } from "../../../testwerkzeug/harness";
import { SaldoVerlaufChart } from "./SaldoVerlaufChart";

// Der Chart formatiert Beträge über useGeld und braucht deshalb den Einstellungs-Kontext,
// der seine Werte aus der Datenbank holt.
let db: Database;
beforeAll(sqlLaden);
beforeEach(() => {
  db?.close();
  db = frischeDb();
  halter.setzen(pluginApi(db));
});

/**
 * Der gezeichnete Linienzug — und zwar erst, wenn er da IST. Ein leerer Pfad besteht sonst
 * jede „enthält kein NaN"-Prüfung, ohne dass je etwas gezeichnet wurde.
 */
async function pfad(container: HTMLElement): Promise<string> {
  let d = "";
  await waitFor(() => {
    d = container.querySelector("svg path[d]")?.getAttribute("d") ?? "";
    expect(d).toMatch(/^M/);
  });
  return d;
}

describe("SaldoVerlauf", () => {
  it("zeichnet für jeden Monat einen Punkt und beschriftet die Achse", async () => {
    const { container } = rendere(
      <SaldoVerlaufChart
        labels={["Jan", "Feb", "Mär"]}
        werte={[120000, 90000, 155000]}
        legende="Verlauf"
      />,
    );
    // Drei Stützstellen ergeben zwei Strecken: ein M und zwei L.
    const d = await pfad(container);
    expect(d.match(/[ML]/g)).toHaveLength(3);
    expect(container.textContent).toMatch("Jan");
    expect(container.textContent).toMatch("Mär");
  });

  it("kommt mit einer einzigen Stützstelle zurecht", async () => {
    const { container } = rendere(
      <SaldoVerlaufChart labels={["Jan"]} werte={[50000]} legende="Verlauf" />,
    );
    const d = await pfad(container);
    expect(d).not.toMatch(/NaN|Infinity/);
  });

  it("zeichnet eine waagerechte Linie, wenn sich nichts bewegt", async () => {
    const { container } = rendere(
      <SaldoVerlaufChart labels={["Jan", "Feb"]} werte={[70000, 70000]} legende="Verlauf" />,
    );
    // Gleiche Werte heißen Wertebereich null — hier entsteht sonst eine Division durch null.
    expect(await pfad(container)).not.toMatch(/NaN|Infinity/);
  });

  it("verkraftet negative Stände, ohne aus der Fläche zu laufen", async () => {
    const { container } = rendere(
      <SaldoVerlaufChart labels={["Jan", "Feb"]} werte={[-40000, 25000]} legende="Verlauf" />,
    );
    const d = await pfad(container);
    expect(d).not.toMatch(/NaN/);
    const ys = [...d.matchAll(/[ML]\s*[\d.]+[ ,]([\d.]+)/g)].map((m) => Number(m[1]));
    expect(ys.every((y) => y >= 0 && y <= 300)).toBe(true);
  });
});
