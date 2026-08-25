/** @vitest-environment jsdom */
// Kategorie-Auswahl — reine Komponente ohne Datenbank.
//
// Sie ist an vielen Stellen eingebaut (Buchung, Budget, Topf, Vertrag). Ein Fehler hier
// wirkt sich überall aus, deshalb eigene Tests statt nur nebenbei über die Screens.

import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Kategorie } from "../../../core";
// Seiteneffekt-Import: initialisiert i18next. Ohne ihn rendert t() den Schlüsselpfad
// statt des Textes — die Komponente wird hier bewusst ohne den EinstellungenProvider
// gerendert (sie braucht keine Datenbank), also muss die Übersetzung von Hand her.
import "../../../i18n/i18n";
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

  // Die Tastaturwahl. Sie ist der Grund, warum die Suche ueberhaupt etwas taugt: wer drei
  // Buchstaben tippt, hat den Treffer vor sich und soll nicht zur Maus greifen muessen.
  it("waehlt den ersten Treffer der Suche mit Enter", async () => {
    const nutzer = userEvent.setup();
    const gewaehlt: string[] = [];
    render(<CategoryPicker kategorien={kategorien} value="" onChange={(id) => gewaehlt.push(id)} />);

    await nutzer.click(screen.getAllByRole("button")[0]);
    const suchfeld = await screen.findByRole("textbox");
    await nutzer.type(suchfeld, "strom");
    await nutzer.keyboard("{Enter}");

    await waitFor(() => expect(gewaehlt).toEqual(["strom"]));
  });

  it("wandert mit den Pfeiltasten durch die Liste — quer ueber die Gruppengrenze", async () => {
    const nutzer = userEvent.setup();
    const gewaehlt: string[] = [];
    render(<CategoryPicker kategorien={kategorien} value="" onChange={(id) => gewaehlt.push(id)} />);

    await nutzer.click(screen.getAllByRole("button")[0]);
    const suchfeld = await screen.findByRole("textbox");
    // Die Reihenfolge ist die sichtbare: keine Kategorie, Wohnen, Miete, Strom, …
    // Der zweite Schritt landet also in einer UNTERkategorie und nicht bei der naechsten
    // Hauptgruppe — genau das ist der Punkt einer flachen Reihe.
    await nutzer.type(suchfeld, "{ArrowDown}{ArrowDown}");
    await nutzer.keyboard("{Enter}");

    await waitFor(() => expect(gewaehlt).toEqual(["miete"]));
  });

  it("nimmt mit Enter ohne Suche die erste Zeile — „keine Kategorie\u201c", async () => {
    const nutzer = userEvent.setup();
    const gewaehlt: string[] = [];
    render(<CategoryPicker kategorien={kategorien} value="miete" onChange={(id) => gewaehlt.push(id)} />);

    await nutzer.click(screen.getAllByRole("button")[0]);
    const suchfeld = await screen.findByRole("textbox");
    await nutzer.type(suchfeld, "{Enter}");

    await waitFor(() => expect(gewaehlt).toEqual([""]));
  });

  it("laeuft am oberen und unteren Ende nicht aus der Liste heraus", async () => {
    const nutzer = userEvent.setup();
    const gewaehlt: string[] = [];
    render(<CategoryPicker kategorien={kategorien} value="" onChange={(id) => gewaehlt.push(id)} />);

    await nutzer.click(screen.getAllByRole("button")[0]);
    const suchfeld = await screen.findByRole("textbox");
    // Zehnmal nach oben aus einer Liste mit sechs Zeilen: die Markierung bleibt oben
    // stehen, statt in einen Index zu laufen, den es nicht gibt.
    await nutzer.type(suchfeld, "{ArrowUp>10/}");
    await nutzer.keyboard("{Enter}");

    await waitFor(() => expect(gewaehlt).toEqual([""]));
  });

  // Maus und Tastatur teilen sich EINE Markierung. Vorher malte `:hover` eine zweite
  // daneben, und bei jedem Pfeildruck standen zwei Zeilen markiert da — man sah nicht
  // mehr, welche gilt. Sichtbar ist das nur im Browser; pruefbar ist die Haelfte, die
  // zaehlt: die Zeile unter dem Zeiger IST die markierte.
  it("uebernimmt die Markierung, wenn die Maus auf eine Zeile faehrt", async () => {
    const nutzer = userEvent.setup();
    const gewaehlt: string[] = [];
    render(<CategoryPicker kategorien={kategorien} value="" onChange={(id) => gewaehlt.push(id)} />);

    await nutzer.click(screen.getAllByRole("button")[0]);
    const suchfeld = await screen.findByRole("textbox");
    await nutzer.type(suchfeld, "{ArrowDown}{ArrowDown}");
    expect(screen.getByText("Miete").closest("button")).toHaveAttribute("data-markiert");

    // Der Zeiger wandert woanders hin — und nimmt die Markierung mit.
    await nutzer.hover(screen.getByText("Gehalt"));
    await waitFor(() => {
      expect(document.querySelectorAll("[data-markiert]")).toHaveLength(1);
      expect(screen.getByText("Gehalt").closest("button")).toHaveAttribute("data-markiert");
    });

    // Und Enter nimmt dann auch die: eine Markierung, eine Bedeutung.
    await nutzer.keyboard("{Enter}");
    await waitFor(() => expect(gewaehlt).toEqual(["gehalt"]));
  });

  it("kommt mit einer leeren Kategorienliste zurecht", async () => {
    const nutzer = userEvent.setup();
    render(<CategoryPicker kategorien={[]} value="" onChange={() => {}} />);
    await nutzer.click(screen.getAllByRole("button")[0]);
    // Kein Absturz, und der Platzhalter bleibt stehen.
    expect(document.body.textContent).toMatch(/wählen/);
  });
});
