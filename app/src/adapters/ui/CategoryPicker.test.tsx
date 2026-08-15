/** @vitest-environment jsdom */
// Kategorie-Auswahl — reine Komponente ohne Datenbank.
//
// Sie ist an vielen Stellen eingebaut (Buchung, Budget, Topf, Vertrag). Ein Fehler hier
// wirkt sich überall aus, deshalb eigene Tests statt nur nebenbei über die Screens.

import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Kategorie } from "../../core";
import { CategoryPicker } from "./CategoryPicker";

const kategorien: Kategorie[] = [
  { id: "wohnen", name: "Wohnen", defaultCharakter: "Aufwand" },
  { id: "miete", name: "Miete", defaultCharakter: "Aufwand", elternId: "wohnen" },
  { id: "strom", name: "Strom", defaultCharakter: "Aufwand", elternId: "wohnen" },
  { id: "essen", name: "Lebensmittel", defaultCharakter: "Aufwand" },
  { id: "gehalt", name: "Gehalt", defaultCharakter: "Ertrag" },
];

describe("CategoryPicker", () => {
  it("zeigt den Platzhalter, solange nichts gewählt ist", () => {
    render(<CategoryPicker kategorien={kategorien} value="" onChange={() => {}} />);
    expect(document.body.textContent).toMatch(/wählen/);
  });

  it("zeigt den Namen der gewählten Kategorie", () => {
    render(<CategoryPicker kategorien={kategorien} value="miete" onChange={() => {}} />);
    expect(document.body.textContent).toMatch(/Miete/);
  });

  it("öffnet die Liste und zeigt die Kategorien", async () => {
    const nutzer = userEvent.setup();
    render(<CategoryPicker kategorien={kategorien} value="" onChange={() => {}} />);

    await nutzer.click(screen.getAllByRole("button")[0]);
    await waitFor(() => expect(document.body.textContent).toMatch(/Lebensmittel/));
    expect(document.body.textContent).toMatch(/Gehalt/);
  });

  it("meldet die Auswahl nach oben", async () => {
    const nutzer = userEvent.setup();
    const gewaehlt: string[] = [];
    render(
      <CategoryPicker kategorien={kategorien} value="" onChange={(id) => gewaehlt.push(id)} />,
    );

    await nutzer.click(screen.getAllByRole("button")[0]);
    await waitFor(() => expect(document.body.textContent).toMatch(/Lebensmittel/));
    await nutzer.click(screen.getByText("Lebensmittel"));

    expect(gewaehlt).toContain("essen");
  });

  it("filtert die Liste über die Suche", async () => {
    const nutzer = userEvent.setup();
    render(<CategoryPicker kategorien={kategorien} value="" onChange={() => {}} />);

    await nutzer.click(screen.getAllByRole("button")[0]);
    const suchfeld = await screen.findByRole("textbox");
    await nutzer.type(suchfeld, "strom");

    await waitFor(() => expect(document.body.textContent).toMatch(/Strom/));
    // „Gehalt" passt nicht zur Suche und muss verschwinden — sonst filtert nichts.
    expect(screen.queryByText("Gehalt")).toBeNull();
  });

  it("findet auch bei abweichender Groß-/Kleinschreibung", async () => {
    const nutzer = userEvent.setup();
    render(<CategoryPicker kategorien={kategorien} value="" onChange={() => {}} />);
    await nutzer.click(screen.getAllByRole("button")[0]);
    const suchfeld = await screen.findByRole("textbox");
    await nutzer.type(suchfeld, "LEBENS");
    await waitFor(() => expect(document.body.textContent).toMatch(/Lebensmittel/));
  });

  it("kommt mit einer leeren Kategorienliste zurecht", async () => {
    const nutzer = userEvent.setup();
    render(<CategoryPicker kategorien={[]} value="" onChange={() => {}} />);
    await nutzer.click(screen.getAllByRole("button")[0]);
    // Kein Absturz, und der Platzhalter bleibt stehen.
    expect(document.body.textContent).toMatch(/wählen/);
  });
});
