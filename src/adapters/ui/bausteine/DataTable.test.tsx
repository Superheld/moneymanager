/** @vitest-environment jsdom */
// Seitensteuerung und Zeilenhöhe der Tabelle.
//
// Beides hängt zusammen: bei tausenden Buchungen blättert man viel, und eine Zeile, die
// je nach Inhalt zweizeilig wird, verschiebt den Seitenschalter unter dem Mauszeiger.

import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DataTable } from ".";

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

describe("DataTable — Zeilenhöhe und Breite", () => {
  it("lässt Zellen nicht umbrechen", () => {
    const { container } = tabelle();
    const zelle = container.querySelector("tbody td") as HTMLElement;
    expect(zelle.style.whiteSpace).toBe("nowrap");
    expect(zelle.style.textOverflow).toBe("ellipsis");
  });

  /**
   * Der Kern der Breitenkappung: sie sitzt am inneren Block, NICHT an der Zelle. Die
   * Wirkung von max-width auf Tabellenzellen ist in CSS 2.1 undefiniert und wird bei
   * `table-layout: auto` ignoriert — genau deshalb hatte `column.maxWidth` an den
   * Konten-Spalten nichts bewirkt und lange Namen schoben die Tabelle aus dem Bild.
   */
  it("kappt den Zellinhalt in einem Block, nicht an der Zelle selbst", () => {
    const { container } = tabelle();
    const inhalt = container.querySelector("tbody td > div") as HTMLElement;
    expect(inhalt).toBeTruthy();
    expect(inhalt.style.maxWidth).toBeTruthy();
    expect(inhalt.style.overflow).toBe("hidden");
    expect(inhalt.style.textOverflow).toBe("ellipsis");
  });

  it("begrenzt jede Spalte auch ohne eigene Angabe", () => {
    const lang = [{ name: "SWB - Service-, Wohnungsvermietungs- und Verwaltungsgesellschaft mbH" }];
    const { container } = render(<DataTable columns={[{ key: "name", label: "Name" }]} rows={lang} />);
    const inhalt = container.querySelector("tbody td > div") as HTMLElement;
    expect(inhalt.style.maxWidth).toBe("32ch");
    // Abgeschnitten wird nur die Anzeige — der volle Text bleibt als Tooltip erreichbar.
    expect(inhalt.title).toBe(lang[0].name);
  });

  it("lässt eine Spalte ihre eigene Kappung setzen", () => {
    const { container } = render(
      <DataTable columns={[{ key: "name", label: "Name", maxWidth: 320 }]} rows={zeilen.slice(0, 3)} />,
    );
    const inhalt = container.querySelector("tbody td > div") as HTMLElement;
    expect(inhalt.style.maxWidth).toBe("320px");
  });

  /** Rechtsbündige Zahlen müssen am rechten Zellenrand bleiben, nicht am Ende des Blocks. */
  it("schiebt rechtsbündige Spalten an den rechten Rand", () => {
    const { container } = render(
      <DataTable columns={[{ key: "name", label: "Name" }, { key: "n", label: "Betrag", align: "right" }]} rows={[{ name: "A", n: "12,00" }]} />,
    );
    const bloecke = container.querySelectorAll("tbody td > div");
    expect((bloecke[0] as HTMLElement).style.marginLeft).toBe("");
    expect((bloecke[1] as HTMLElement).style.marginLeft).toBe("auto");
  });

  /** Fangnetz: passt die Tabelle trotzdem nicht, scrollt SIE — nicht die ganze Seite. */
  it("liegt in einem waagerecht scrollbaren Rahmen", () => {
    const { container } = tabelle();
    const rahmen = container.querySelector("table")!.parentElement as HTMLElement;
    expect(rahmen.style.overflowX).toBe("auto");
    expect(rahmen.style.maxWidth).toBe("100%");
  });
});
