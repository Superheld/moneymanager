/** @vitest-environment jsdom */
// `Umschalter` auf Base UI `ToggleGroup` — eine Gruppe, genau einer gedrückt.

import { useState } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Umschalter } from "./Umschalter";

function Leiste() {
  const [w, setW] = useState<"fluss" | "saldo" | "tabelle">("fluss");
  return (
    <Umschalter
      label="Ansicht"
      wert={w}
      aufAendern={setW}
      optionen={[
        { wert: "fluss", text: "Fluss" },
        { wert: "saldo", text: "Saldo" },
        { wert: "tabelle", text: "Tabelle" },
      ]}
    />
  );
}

const knopf = (name: string) => screen.getByRole("button", { name });

describe("Umschalter", () => {
  it("ist eine benannte Gruppe und drückt, was man anklickt", async () => {
    render(<Leiste />);
    expect(screen.getByRole("group", { name: "Ansicht" })).toBeInTheDocument();
    expect(knopf("Fluss")).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(knopf("Saldo"));
    expect(knopf("Saldo")).toHaveAttribute("aria-pressed", "true");
    expect(knopf("Fluss")).toHaveAttribute("aria-pressed", "false");
  });

  it("lässt den gedrückten Knopf gedrückt — sonst wäre keine Ansicht gewählt", async () => {
    render(<Leiste />);
    await userEvent.click(knopf("Fluss"));
    expect(knopf("Fluss")).toHaveAttribute("aria-pressed", "true");
  });

  it("wechselt den Fokus mit den Pfeiltasten — die Gruppe ist ein Halt, nicht drei", async () => {
    const nutzer = userEvent.setup();
    render(<Leiste />);
    await nutzer.tab();
    expect(document.activeElement).toBe(knopf("Fluss"));
    await nutzer.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(knopf("Saldo"));
  });
});
