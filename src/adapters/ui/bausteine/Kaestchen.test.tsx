/** @vitest-environment jsdom */
// `Kaestchen` — Base UI `Checkbox` unter unserem Namen. Geprüft wird, was beim Wechsel
// vom nativen Feld verloren gehen kann: der Name, der Klick auf den Text, die Tastatur.

import { useState } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Kaestchen } from "./Kaestchen";

function Mit(props: { label?: string; text?: string; disabled?: boolean; anfangs?: boolean }) {
  const [an, setAn] = useState(props.anfangs ?? false);
  return (
    <Kaestchen an={an} aufAendern={setAn} label={props.label} disabled={props.disabled}>
      {props.text}
    </Kaestchen>
  );
}

describe("Kaestchen", () => {
  it("heisst wie der Text daneben, und ein Klick auf den Text kreuzt an", async () => {
    render(<Mit text="Mitnehmen" />);
    const kasten = screen.getByRole("checkbox", { name: "Mitnehmen" });
    expect(kasten).not.toBeChecked();
    await userEvent.click(screen.getByText("Mitnehmen"));
    expect(kasten).toBeChecked();
  });

  it("lässt sich mit der Leertaste umlegen", async () => {
    render(<Mit text="Mitnehmen" />);
    const kasten = screen.getByRole("checkbox", { name: "Mitnehmen" });
    kasten.focus();
    await userEvent.keyboard(" ");
    expect(kasten).toBeChecked();
  });

  it("nimmt einen eigenen Namen, auch wenn daneben mehr Text steht", () => {
    // Base UI verweist per aria-labelledby auf das ganze Label, und das gewinnt gegen
    // aria-label — ohne Gegenmassnahme hiesse das Kästchen wie der ganze Absatz.
    render(<Mit label="Beta" text="Beta · aus — holt Vorabfassungen" />);
    expect(screen.getByRole("checkbox", { name: "Beta" })).toBeInTheDocument();
  });

  it("braucht ohne Text einen Namen und trägt ihn", () => {
    render(<Mit label="Zeile wählen" />);
    expect(screen.getByRole("checkbox", { name: "Zeile wählen" })).toBeInTheDocument();
  });

  it("lässt sich gesperrt nicht umlegen", async () => {
    render(<Mit text="Mitnehmen" disabled anfangs />);
    const kasten = screen.getByRole("checkbox", { name: "Mitnehmen" });
    await userEvent.click(kasten);
    expect(kasten).toBeChecked();
  });
});
