/** @vitest-environment jsdom */
// Seitensteuerung und Zeilenhöhe der Tabelle.
//
// Beides hängt zusammen: bei tausenden Buchungen blättert man viel, und eine Zeile, die
// je nach Inhalt zweizeilig wird, verschiebt den Seitenschalter unter dem Mauszeiger.

import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DataTable } from "./ds";

const zeilen = Array.from({ length: 250 }, (_, i) => ({ id: `z${i}`, name: `Buchung ${i}` }));
const spalten = [{ key: "name", label: "Name" }];

// Die Komponente ist bewusst sprachfrei — die Beschriftungen reicht die App durch.
const LABELS = {
  labelSeite: "Seite",
  labelErste: "erste",
  labelLetzte: "letzte",
  labelZurueck: "zurück",
  labelVor: "nächste",
};

function tabelle(props: Record<string, unknown> = {}) {
  return render(<DataTable columns={spalten} rows={zeilen} pageSize={25} {...LABELS} {...props} />);
}

describe("DataTable — Seitensteuerung", () => {
  it("zeigt die erste Seite und blättert vorwärts", async () => {
    const nutzer = userEvent.setup();
    tabelle();
    expect(screen.getByText("Buchung 0")).toBeInTheDocument();

    await nutzer.click(screen.getByTitle("nächste"));
    expect(screen.getByText("Buchung 25")).toBeInTheDocument();
    expect(screen.queryByText("Buchung 0")).not.toBeInTheDocument();
  });

  /** Der Grund für den Sprungknopf: 250 Zeilen sind 10 Klicks bis ans Ende. */
  it("springt mit einem Klick auf die letzte Seite", async () => {
    const nutzer = userEvent.setup();
    tabelle();
    await nutzer.click(screen.getByTitle("letzte"));
    expect(screen.getByText("Buchung 249")).toBeInTheDocument();
  });

  // Das Feld ist controlled — clear() springt sofort auf den alten Wert zurück und
  // type() hängt dann an. Geprüft wird deshalb der Änderungs-Handler direkt.
  it("nimmt eine direkt eingegebene Seitenzahl", () => {
    tabelle();
    fireEvent.change(screen.getByLabelText("Seite"), { target: { value: "4" } });
    expect(screen.getByText("Buchung 75")).toBeInTheDocument(); // Seite 4 → Zeilen 75–99
  });

  it("begrenzt eine zu große Eingabe auf die letzte Seite", () => {
    tabelle();
    fireEvent.change(screen.getByLabelText("Seite"), { target: { value: "999" } });
    expect(screen.getByText("Buchung 249")).toBeInTheDocument();
  });

  it("ignoriert eine leere Eingabe, statt auf Seite 1 zu springen", () => {
    tabelle();
    fireEvent.change(screen.getByLabelText("Seite"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("Seite"), { target: { value: "" } });
    expect(screen.getByText("Buchung 75")).toBeInTheDocument();
  });

  it("zeigt keine Seitensteuerung, wenn alles auf eine Seite passt", () => {
    render(<DataTable columns={spalten} rows={zeilen.slice(0, 5)} pageSize={25} {...LABELS} />);
    expect(screen.queryByLabelText("Seite")).not.toBeInTheDocument();
  });
});

describe("DataTable — Zeilenhöhe", () => {
  it("lässt Zellen nicht umbrechen", () => {
    const { container } = tabelle();
    const zelle = container.querySelector("tbody td") as HTMLElement;
    expect(zelle.style.whiteSpace).toBe("nowrap");
    expect(zelle.style.textOverflow).toBe("ellipsis");
  });

  it("begrenzt die Spaltenbreite, wenn maxWidth gesetzt ist", () => {
    const { container } = render(
      <DataTable columns={[{ key: "name", label: "Name", maxWidth: 320 }]} rows={zeilen.slice(0, 3)} />,
    );
    const zelle = container.querySelector("tbody td") as HTMLElement;
    expect(zelle.style.maxWidth).toBe("320px");
  });
});
