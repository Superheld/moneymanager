/**
 * @vitest-environment jsdom
 */
// Der Auswahl-Baustein. Getestet wird, was ein natives `<select>` von sich aus konnte
// und was hier deshalb nicht verloren gehen darf: den gewählten Text anzeigen, sich per
// Tastatur bedienen lassen und die Wahl melden.

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Auswahl, type AuswahlOption } from "./Auswahl";

const OPTIONEN: AuswahlOption[] = [
  { wert: "giro", text: "Girokonto" },
  { wert: "spar", text: "Sparkonto" },
  { wert: "alt", text: "Altkonto", deaktiviert: true },
];

describe("Auswahl", () => {
  it("zeigt den TEXT der gewählten Option, nicht ihren Wert", () => {
    // Der Wert ist bei uns fast überall eine UUID. Stünde die im Knopf, wäre das Feld
    // unbrauchbar — deshalb ist das hier der erste Test und nicht ein nachträglicher.
    render(<Auswahl wert="spar" aufAenderung={() => {}} optionen={OPTIONEN} ariaLabel="Konto" />);
    expect(screen.getByRole("combobox")).toHaveTextContent("Sparkonto");
    expect(screen.getByRole("combobox")).not.toHaveTextContent("spar");
  });

  it("zeigt den Platzhalter, solange nichts gewählt ist", () => {
    render(<Auswahl wert="" aufAenderung={() => {}} optionen={OPTIONEN} platzhalter="Bitte wählen" ariaLabel="Konto" />);
    expect(screen.getByRole("combobox")).toHaveTextContent("Bitte wählen");
  });

  it("öffnet die Liste und meldet die Wahl", async () => {
    const nutzer = userEvent.setup();
    const gemeldet = vi.fn();
    render(<Auswahl wert="giro" aufAenderung={gemeldet} optionen={OPTIONEN} ariaLabel="Konto" />);

    await nutzer.click(screen.getByRole("combobox"));
    await nutzer.click(await screen.findByRole("option", { name: "Sparkonto" }));

    expect(gemeldet).toHaveBeenCalledWith("spar");
  });

  it("lässt sich mit der Tastatur bedienen", async () => {
    // Der eigentliche Grund für die Bibliothek. Ein selbstgebautes Auswahlfeld sieht mit
    // der Maus gut aus und scheitert hier.
    const nutzer = userEvent.setup();
    const gemeldet = vi.fn();
    render(<Auswahl wert="giro" aufAenderung={gemeldet} optionen={OPTIONEN} ariaLabel="Konto" />);

    const knopf = screen.getByRole("combobox");
    knopf.focus();
    await nutzer.keyboard("{Enter}");
    expect(await screen.findByRole("listbox")).toBeInTheDocument();

    await nutzer.keyboard("{ArrowDown}{Enter}");
    expect(gemeldet).toHaveBeenCalledWith("spar");
  });

  it("meldet eine gesperrte Option nicht", async () => {
    const nutzer = userEvent.setup();
    const gemeldet = vi.fn();
    render(<Auswahl wert="giro" aufAenderung={gemeldet} optionen={OPTIONEN} ariaLabel="Konto" />);

    await nutzer.click(screen.getByRole("combobox"));
    await nutzer.click(await screen.findByRole("option", { name: "Altkonto" }));

    expect(gemeldet).not.toHaveBeenCalled();
  });

  it("öffnet gar nicht, wenn das Feld gesperrt ist", async () => {
    const nutzer = userEvent.setup();
    render(<Auswahl wert="giro" aufAenderung={() => {}} optionen={OPTIONEN} deaktiviert ariaLabel="Konto" />);

    await nutzer.click(screen.getByRole("combobox"));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
