/** @vitest-environment jsdom */
// Die Zeilenauswahl trägt eine Entscheidung IN einer Tabellenzeile. Geprüft wird, was dabei
// leicht verlorengeht: der Name (in einer Tabelle steht er in der Kopfzeile, nicht am
// Feld) und die gesperrte Möglichkeit, die sichtbar bleiben muss.

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Zeilenauswahl } from "./Zeilenauswahl";

const MOEGLICH = [
  { wert: "a" as const, text: "Erstes" },
  { wert: "b" as const, text: "Zweites" },
];

describe("Zeilenauswahl", () => {
  it("trägt ihren Namen, auch wenn keine Beschriftung danebensteht", () => {
    render(<Zeilenauswahl label="Format" wert="a" moeglichkeiten={MOEGLICH} onChange={() => {}} />);
    expect(screen.getByRole("combobox", { name: "Format" })).toBeInTheDocument();
  });

  it("meldet die neue Wahl", async () => {
    const gewaehlt = vi.fn();
    const nutzer = userEvent.setup();
    render(<Zeilenauswahl label="Format" wert="a" moeglichkeiten={MOEGLICH} onChange={gewaehlt} />);

    await nutzer.selectOptions(screen.getByRole("combobox", { name: "Format" }), "b");
    expect(gewaehlt).toHaveBeenCalledWith("b");
  });

  /**
   * Eine Möglichkeit, die es gerade nicht gibt, bleibt SICHTBAR und ist nur gesperrt.
   * Verschwände sie, stünde in der Datenbank etwas anderes als auf dem Bildschirm — und
   * niemand könnte erklären, warum eine getroffene Wahl nicht mehr da ist.
   */
  it("zeigt Gesperrtes, statt es wegzulassen", () => {
    render(
      <Zeilenauswahl
        label="Format"
        wert="a"
        moeglichkeiten={[...MOEGLICH, { wert: "c" as const, text: "Drittes", gesperrt: true }]}
        onChange={() => {}}
      />,
    );
    const option = screen.getByRole("option", { name: "Drittes" }) as HTMLOptionElement;
    expect(option).toBeInTheDocument();
    expect(option.disabled).toBe(true);
  });
});
