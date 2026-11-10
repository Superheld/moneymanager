/** @vitest-environment jsdom */
// Die Fehlergrenze — gesucht wird über i18n-SCHLÜSSEL (im Test ist i18n nicht aufgesetzt).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Fehlergrenze } from "./Fehlergrenze";

/** Wirft beim Zeichnen, solange `kaputt` gesetzt ist. */
let kaputt = true;
function Wackelig({ name = "Inhalt" }: { name?: string }) {
  if (kaputt) throw new Error("Division durch Dienstag");
  return <p>{name}</p>;
}

describe("Fehlergrenze", () => {
  // React meldet einen gefangenen Fehler zusätzlich selbst in der Konsole; im Testlauf
  // wäre das Lärm, der wie ein Fehlschlag aussieht.
  let konsole: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    kaputt = true;
    konsole = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => konsole.mockRestore());

  it("zeigt den Inhalt, solange nichts schiefgeht", () => {
    kaputt = false;
    render(
      <Fehlergrenze>
        <Wackelig />
      </Fehlergrenze>,
    );
    expect(screen.getByText("Inhalt")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("zeigt statt einer weissen Seite eine Meldung — samt der technischen", () => {
    render(
      <Fehlergrenze>
        <Wackelig />
      </Fehlergrenze>,
    );
    const meldung = screen.getByRole("alert");
    expect(meldung.textContent).toContain("fehlergrenze.titel");
    expect(meldung.textContent).toContain("fehlergrenze.text");
    expect(meldung.textContent).toContain("Division durch Dienstag");
  });

  it("lässt stehen, was AUSSERHALB der Grenze liegt", () => {
    render(
      <div>
        <nav>Navigation</nav>
        <Fehlergrenze>
          <Wackelig />
        </Fehlergrenze>
      </div>,
    );
    expect(screen.getByText("Navigation")).toBeTruthy();
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("schreibt den Fehler in die Konsole", () => {
    render(
      <Fehlergrenze>
        <Wackelig />
      </Fehlergrenze>,
    );
    expect(konsole.mock.calls.some((c: unknown[]) => c[0] === "Fehler beim Zeichnen:")).toBe(true);
  });

  it("versucht es auf Knopfdruck noch einmal", async () => {
    render(
      <Fehlergrenze>
        <Wackelig />
      </Fehlergrenze>,
    );
    kaputt = false;
    await userEvent.click(screen.getByRole("button", { name: "fehlergrenze.nochmal" }));
    expect(screen.getByText("Inhalt")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("bleibt bei der Meldung, wenn der zweite Versuch wieder scheitert", async () => {
    render(
      <Fehlergrenze>
        <Wackelig />
      </Fehlergrenze>,
    );
    await userEvent.click(screen.getByRole("button", { name: "fehlergrenze.nochmal" }));
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  // Die Grenze um einen Screen: wer woanders hinnavigiert, soll dort ankommen.
  it("vergisst den Fehler, wenn der Rücksetz-Wert wechselt", () => {
    const { rerender } = render(
      <Fehlergrenze ruecksetzenBei="konten">
        <Wackelig />
      </Fehlergrenze>,
    );
    expect(screen.getByRole("alert")).toBeTruthy();

    kaputt = false;
    rerender(
      <Fehlergrenze ruecksetzenBei="budgets">
        <Wackelig name="Budgets" />
      </Fehlergrenze>,
    );
    expect(screen.getByText("Budgets")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("vergisst ihn NICHT bei einem Neuzeichnen ohne Wechsel", () => {
    const { rerender } = render(
      <Fehlergrenze ruecksetzenBei="konten">
        <Wackelig />
      </Fehlergrenze>,
    );
    kaputt = false;
    rerender(
      <Fehlergrenze ruecksetzenBei="konten">
        <Wackelig />
      </Fehlergrenze>,
    );
    expect(screen.getByRole("alert")).toBeTruthy();
  });
});
