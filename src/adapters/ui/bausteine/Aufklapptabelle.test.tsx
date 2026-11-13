/** @vitest-environment jsdom */
// Die eine Aufklapptabelle. Geprüft wird, was beim Vereinheitlichen verlorengehen konnte:
// die leere Liste sagt etwas, eine klickbare Zeile ist auch mit der Tastatur erreichbar,
// und eine Zeile ohne Klick sieht nicht nach einem aus.

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Aufklapptabelle } from "./Aufklapptabelle";

const ZEILEN = [{ id: "a", text: "Erste" }, { id: "b", text: "Zweite" }];
const SPALTEN = [{ key: "text", label: "Text", render: (z: { id: string; text: string }) => z.text }];

describe("Aufklapptabelle", () => {
  it("zeigt den Leertext statt einer leeren Fläche", () => {
    render(<Aufklapptabelle zeilen={[]} spalten={SPALTEN} schluessel={(z) => z.id} leer="nichts da" />);
    expect(screen.getByText("nichts da")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("öffnet eine Zeile per Klick und per Enter", async () => {
    const onZeile = vi.fn();
    render(<Aufklapptabelle zeilen={ZEILEN} spalten={SPALTEN} schluessel={(z) => z.id} leer="—" onZeile={onZeile} />);
    const nutzer = userEvent.setup();
    await nutzer.click(screen.getByText("Erste"));
    expect(onZeile).toHaveBeenLastCalledWith(ZEILEN[0]);
    await nutzer.tab();
    await nutzer.keyboard("{Enter}");
    expect(onZeile).toHaveBeenCalledTimes(2);
  });

  it("macht Zeilen ohne Klick nicht zu Knöpfen", () => {
    render(<Aufklapptabelle zeilen={ZEILEN} spalten={SPALTEN} schluessel={(z) => z.id} leer="—" />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.getByText("Text")).toBeInTheDocument(); // der Kopf steht ab Werk da
  });
});
