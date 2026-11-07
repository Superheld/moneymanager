/** @vitest-environment jsdom */
// Die TAN-Rückfrage. Erfundene Werte; echt sind die drei Formen, die die Bibliothek
// unterscheidet: eingetippte TAN, Bild-TAN und decoupled.

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Database } from "sql.js";

const halter = vi.hoisted(() => {
  let aktuell: unknown = null;
  return { setzen: (d: unknown) => (aktuell = d), lesen: () => aktuell };
});
vi.mock("../../persistence/db", () => ({ getDb: async () => halter.lesen() }));

import { frischeDb, pluginApi, rendere, sqlLaden } from "../../../testwerkzeug/harness";
import { TanDialog, useTanFrage, type TanFrage } from "./TanDialog";

let db: Database;

beforeAll(sqlLaden);
beforeEach(() => {
  db?.close();
  db = frischeDb();
  halter.setzen(pluginApi(db));
});

async function zeige(frage: TanFrage) {
  rendere(<TanDialog frage={frage} onFertig={() => {}} />);
  await waitFor(() => {
    if (!document.body.textContent) throw new Error("noch nichts gerendert");
  });
}

function frage(over: Partial<TanFrage["herausforderung"]> = {}) {
  const antworten = vi.fn();
  return {
    antworten,
    frage: {
      antworten,
      herausforderung: { text: "Bitte TAN eingeben", decoupled: false, ...over },
    } as TanFrage,
  };
}

describe("TanDialog", () => {
  it("bestätigt mit Enter im Feld", async () => {
    // Beim Abtippen liegt die Hand auf der Tastatur; zur Maus zu greifen ist hier der
    // unnötigste Weg.
    const { frage: f, antworten } = frage();
    await zeige(f);
    await userEvent.type(screen.getByRole("textbox"), "123456{Enter}");
    expect(antworten).toHaveBeenCalledWith("123456");
  });

  it("tut bei leerem Enter nichts", async () => {
    // Ein Abbruch geschieht über das Schliessen. Ein leeres Enter sieht wie ein Versehen
    // aus — und beantwortet die Bank sonst mit nichts.
    const { frage: f, antworten } = frage();
    await zeige(f);
    await userEvent.type(screen.getByRole("textbox"), "{Enter}");
    expect(antworten).not.toHaveBeenCalled();
  });

  it("bestätigt weiterhin über den Knopf", async () => {
    const { frage: f, antworten } = frage();
    await zeige(f);
    await userEvent.type(screen.getByRole("textbox"), "654321");
    await userEvent.click(screen.getByRole("button", { name: "Bestätigen" }));
    expect(antworten).toHaveBeenCalledWith("654321");
  });

  it("zeigt bei decoupled weder Feld noch Knopf", async () => {
    // Die Freigabe geschieht in der Banking-App; es gibt nichts zu bestätigen.
    const { frage: f } = frage({ decoupled: true });
    await zeige(f);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Bestätigen" })).not.toBeInTheDocument();
    expect(screen.getByText(/Banking-App freigeben/)).toBeInTheDocument();
  });
});

/**
 * Der Weg, auf dem die Rückfrage wieder VERSCHWINDET.
 *
 * Bei decoupled tippt niemand etwas ein — die Freigabe geschieht in der Banking-App, und
 * nur der Adapter erfährt, wann die Bank zugestimmt hat. Ohne diesen Rückweg blieb der
 * Hinweis stehen, bis jemand ihn wegklickte, obwohl der Abruf längst weiterlief.
 */
describe("useTanFrage", () => {
  /** Ein Screen im Kleinen: er zeigt die Frage an und reicht den Frager nach aussen. */
  function Probe({ melde }: { melde: (frageTan: ReturnType<typeof useTanFrage>["frageTan"]) => void }) {
    const { tanFrage, tanFrageSchliessen, frageTan } = useTanFrage();
    melde(frageTan);
    return tanFrage ? <TanDialog frage={tanFrage} onFertig={tanFrageSchliessen} /> : null;
  }

  it("nimmt die Rückfrage weg, sobald der Adapter sie zurückzieht", async () => {
    let frageTan: ReturnType<typeof useTanFrage>["frageTan"] | null = null;
    rendere(<Probe melde={(f) => { frageTan = f; }} />);
    await waitFor(() => expect(frageTan).not.toBeNull());

    const rueckzug = new AbortController();
    void frageTan!({ text: "Bitte in der App bestätigen", decoupled: true }, rueckzug.signal);
    await waitFor(() => expect(screen.getByText(/Bitte in der App bestätigen/)).toBeInTheDocument());

    // Die Bank hat geantwortet — der Adapter zieht die Frage zurück.
    rueckzug.abort();
    await waitFor(() => expect(screen.queryByText(/Bitte in der App bestätigen/)).not.toBeInTheDocument());
  });

  it("lässt eine INZWISCHEN gestellte zweite Frage stehen", async () => {
    // Ein Abruf über mehrere Konten fragt mehrfach. Ein spät eintreffendes Signal darf
    // nur die eigene Frage wegnehmen, nicht die, die gerade auf eine Antwort wartet.
    let frageTan: ReturnType<typeof useTanFrage>["frageTan"] | null = null;
    rendere(<Probe melde={(f) => { frageTan = f; }} />);
    await waitFor(() => expect(frageTan).not.toBeNull());

    const ersterRueckzug = new AbortController();
    void frageTan!({ text: "Erste Freigabe", decoupled: true }, ersterRueckzug.signal);
    await waitFor(() => expect(screen.getByText(/Erste Freigabe/)).toBeInTheDocument());

    void frageTan!({ text: "Zweite Freigabe", decoupled: true }, new AbortController().signal);
    await waitFor(() => expect(screen.getByText(/Zweite Freigabe/)).toBeInTheDocument());

    ersterRueckzug.abort();
    await waitFor(() => expect(screen.getByText(/Zweite Freigabe/)).toBeInTheDocument());
  });
});
