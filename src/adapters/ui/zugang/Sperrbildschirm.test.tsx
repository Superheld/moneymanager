/** @vitest-environment jsdom */
// Der Sperrbildschirm — das Tor vor der App.

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Sperrbildschirm, type SperrbildschirmProps } from "./Sperrbildschirm";

// Gesucht wird über i18n-SCHLÜSSEL, nicht über Formulierungen — im Test ist i18n nicht
// aufgesetzt, `t()` gibt den Schlüssel zurück. Dieselbe Konvention wie in den übrigen
// Screen-Tests (src/CLAUDE.md): nach Wortlaut zu suchen macht die Suite beim nächsten
// Wording-Durchgang rot, ohne dass sich am Verhalten etwas geändert hätte.

const LANG = "eine lange Passphrase";

function aufbauen(ueberschreiben: Partial<SperrbildschirmProps> = {}) {
  const props: SperrbildschirmProps = {
    grund: "einrichten",
    altbestand: false,
    onEinrichten: vi.fn(async () => ({ ok: true, code: "ABCD-EFGH-IJKL" })),
    onEntsperren: vi.fn(async () => true),
    onMitCode: vi.fn(async () => ({ ok: true })),
    onFertig: vi.fn(),
    ...ueberschreiben,
  };
  render(<Sperrbildschirm {...props} />);
  return props;
}

async function tippen(label: string, text: string) {
  await userEvent.type(screen.getByLabelText(label), text);
}

describe("Sperrbildschirm — einrichten", () => {
  it("richtet ein und zeigt den Wiederherstellungscode", async () => {
    const props = aufbauen();
    await tippen("zugang.feldPassphrase", LANG);
    await tippen("zugang.feldWiederholung", LANG);
    await userEvent.click(screen.getByRole("button", { name: "zugang.einrichtenKnopf" }));

    expect(props.onEinrichten).toHaveBeenCalledWith(LANG);
    expect(await screen.findByText(/ABCD-EFGH-IJKL/)).toBeTruthy();
  });

  it("geht NICHT weiter, solange der Code nicht bestätigt ist", async () => {
    // Ein Zettel, den man später holen wollte, wird nicht geholt.
    const props = aufbauen();
    await tippen("zugang.feldPassphrase", LANG);
    await tippen("zugang.feldWiederholung", LANG);
    await userEvent.click(screen.getByRole("button", { name: "zugang.einrichtenKnopf" }));

    await userEvent.click(await screen.findByRole("button", { name: "zugang.weiter" }));
    expect(props.onFertig).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("checkbox"));
    await userEvent.click(screen.getByRole("button", { name: "zugang.weiter" }));
    expect(props.onFertig).toHaveBeenCalled();
  });

  it("meldet zwei verschiedene Eingaben, ohne den Port zu rufen", async () => {
    const props = aufbauen();
    await tippen("zugang.feldPassphrase", LANG);
    await tippen("zugang.feldWiederholung", "etwas anderes hier");
    await userEvent.click(screen.getByRole("button", { name: "zugang.einrichtenKnopf" }));

    expect(await screen.findByText("zugang.stimmtNichtUeberein")).toBeTruthy();
    expect(props.onEinrichten).not.toHaveBeenCalled();
  });

  it("zeigt den Hinweis auf den Altbestand, wenn einer da ist", async () => {
    aufbauen({ altbestand: true });
    expect(screen.getByText("zugang.einrichtenAltbestand")).toBeTruthy();
  });

  it("bietet keinen Weg vorbei — kein Abbrechen, kein Später", async () => {
    // Die Zwangseinrichtung ist der ganze Zweck: wer hier ausweichen kann, legt für
    // immer unverschlüsselt ab, ohne es je wieder zu bemerken.
    aufbauen();
    const knoepfe = screen.getAllByRole("button").map((b) => b.textContent ?? "");
    expect(knoepfe).toEqual(["zugang.einrichtenKnopf"]);
  });
});

describe("Sperrbildschirm — entsperren", () => {
  it("entsperrt und meldet fertig", async () => {
    const props = aufbauen({ grund: "entsperren" });
    await tippen("zugang.feldPassphrase", LANG);
    await userEvent.click(screen.getByRole("button", { name: "zugang.entsperrenKnopf" }));

    expect(props.onEntsperren).toHaveBeenCalledWith(LANG);
    expect(props.onFertig).toHaveBeenCalled();
  });

  it("meldet eine falsche Passphrase und bleibt stehen", async () => {
    const props = aufbauen({ grund: "entsperren", onEntsperren: vi.fn(async () => false) });
    await tippen("zugang.feldPassphrase", "falsch aber lang");
    await userEvent.click(screen.getByRole("button", { name: "zugang.entsperrenKnopf" }));

    expect(await screen.findByText("zugang.passphraseFalsch")).toBeTruthy();
    expect(props.onFertig).not.toHaveBeenCalled();
  });

  it("führt über den Vergessen-Weg zum Wiederherstellungscode", async () => {
    const props = aufbauen({ grund: "entsperren" });
    await userEvent.click(screen.getByRole("button", { name: "zugang.vergessen" }));

    await tippen("zugang.feldCode", "ABCD-EFGH");
    await tippen("zugang.feldNeuePassphrase", LANG);
    await tippen("zugang.feldWiederholung", LANG);
    await userEvent.click(screen.getByRole("button", { name: "zugang.rettungKnopf" }));

    expect(props.onMitCode).toHaveBeenCalledWith("ABCD-EFGH", LANG);
    expect(props.onFertig).toHaveBeenCalled();
  });

  it("meldet einen unbrauchbaren Code", async () => {
    aufbauen({ grund: "entsperren", onMitCode: vi.fn(async () => ({ ok: false })) });
    await userEvent.click(screen.getByRole("button", { name: "zugang.vergessen" }));

    await tippen("zugang.feldCode", "murks");
    await tippen("zugang.feldNeuePassphrase", LANG);
    await tippen("zugang.feldWiederholung", LANG);
    await userEvent.click(screen.getByRole("button", { name: "zugang.rettungKnopf" }));

    expect(await screen.findByText("zugang.codeUnbrauchbar")).toBeTruthy();
  });
});
