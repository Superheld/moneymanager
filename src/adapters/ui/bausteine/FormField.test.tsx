/** @vitest-environment jsdom */
// Die Verknüpfung Label ↔ Feld — geprüft über die Rolle mit NAMEN, also genau so, wie eine
// Vorlesehilfe das Feld findet. Ein `getByRole("textbox")` ohne Namen liefe auch dann grün,
// wenn die Beschriftung nur danebenstünde.

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { FormField } from "./FormField";
import { CategoryPicker } from "./CategoryPicker";
import { Kaestchen } from "./Kaestchen";

describe("FormField", () => {
  it("benennt ein natives Eingabefeld über sein Label", () => {
    render(<FormField label="Bezeichnung"><input /></FormField>);
    expect(screen.getByRole("textbox", { name: "Bezeichnung" })).toBeInTheDocument();
  });

  it("benennt auch Auswahl und mehrzeiliges Feld", () => {
    render(
      <>
        <FormField label="Konto"><select><option>Girokonto</option></select></FormField>
        <FormField label="Notiz"><textarea /></FormField>
      </>,
    );
    expect(screen.getByRole("combobox", { name: "Konto" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Notiz" })).toBeInTheDocument();
  });

  /**
   * Zwei Felder auf einer Seite dürfen sich nicht dieselbe id teilen — sonst benennt das
   * zweite Label das erste Feld, und ein Klick aufs Label springt an die falsche Stelle.
   */
  it("vergibt je Feld eine eigene id", () => {
    render(
      <>
        <FormField label="Erstes"><input /></FormField>
        <FormField label="Zweites"><input /></FormField>
      </>,
    );
    const a = screen.getByRole("textbox", { name: "Erstes" });
    const b = screen.getByRole("textbox", { name: "Zweites" });
    expect(a.id).not.toBe("");
    expect(a.id).not.toBe(b.id);
  });

  it("lässt eine mitgegebene id stehen", () => {
    render(<FormField label="Betrag"><input id="eigene-id" /></FormField>);
    expect(screen.getByRole("textbox", { name: "Betrag" }).id).toBe("eigene-id");
  });

  /**
   * Bei einer eigenen Komponente als Kind zeigt kein htmlFor ins Leere: dort setzt niemand
   * die id, und eine Verknüpfung auf eine nicht existierende id ist nicht besser als keine.
   * Solche Komponenten benennen sich selbst.
   */
  it("zeigt bei einer eigenen Komponente nicht auf eine id, die es nicht gibt", () => {
    const { container } = render(
      <FormField label="Kategorie">
        <CategoryPicker kategorien={[]} value="" onChange={() => {}} />
      </FormField>,
    );
    expect(container.querySelector("label")?.getAttribute("for")).toBeNull();
  });

  it("kommt ohne Label aus", () => {
    render(<FormField><input /></FormField>);
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("liest den Hinweis als Beschreibung des Feldes vor", () => {
    // Vorher stand er nur darunter — eine Vorlesehilfe sagte ihn nie an.
    render(<FormField label="Betrag" hint="ohne Vorzeichen"><input /></FormField>);
    expect(screen.getByRole("textbox", { name: "Betrag" })).toHaveAccessibleDescription("ohne Vorzeichen");
  });

  it("lässt den Pflicht-Stern aus dem Namen", () => {
    render(<FormField label="Konto" required><input /></FormField>);
    expect(screen.getByRole("textbox", { name: "Konto" })).toBeInTheDocument();
  });

  it("benennt Teile in einer Liste nicht um", () => {
    // Base UI `Field` ist für EIN Bedienteil; um eine Liste herum hiesse sonst jedes
    // Kästchen wie das Feld statt wie die Person.
    render(
      <FormField label="Inhaber">
        <span>
          <Kaestchen an={false} aufAendern={() => {}}>Alma</Kaestchen>
          <Kaestchen an={false} aufAendern={() => {}}>Bodo</Kaestchen>
        </span>
      </FormField>,
    );
    expect(screen.getByRole("checkbox", { name: "Alma" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Bodo" })).toBeInTheDocument();
  });
});
