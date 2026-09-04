/** @vitest-environment jsdom */
// Seitensteuerung und Zeilenhöhe der Tabelle.
//
// Beides hängt zusammen: bei tausenden Buchungen blättert man viel, und eine Zeile, die
// je nach Inhalt zweizeilig wird, verschiebt den Seitenschalter unter dem Mauszeiger.

import { afterEach, describe, expect, it } from "vitest";
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

/**
 * Die schmale Form. `matchMedia` gibt es in jsdom nicht — ohne die Attrappe unten gilt
 * ueberall BREIT, und genau darauf verlassen sich die Tests oben und alle Screen-Tests.
 */
describe("DataTable — schmal", () => {
  const spaltenBreit = [
    { key: "name", label: "Name" },
    { key: "datum", label: "Datum" },
    { key: "konto", label: "Konto" },
    { key: "betrag", label: "Betrag", align: "right" as const },
  ];
  const daten = [
    { name: "Stadtwerke", datum: "12.08.2026", konto: "Giro", betrag: "−84,20 €" },
    { name: "Buchladen", datum: "03.08.2026", konto: "Giro", betrag: "−12,90 €" },
  ];

  function schmalStellen(an: boolean) {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      configurable: true,
      value: (media: string) => ({
        matches: an, media, onchange: null,
        addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false,
        addListener() {}, removeListener() {},
      }),
    });
  }

  afterEach(() => {
    Reflect.deleteProperty(window, "matchMedia");
  });

  it("faellt auf zwei Spalten zusammen", () => {
    schmalStellen(true);
    const { container } = render(<DataTable columns={spaltenBreit} rows={daten} />);
    expect(container.querySelectorAll("thead th")).toHaveLength(2);
    expect(container.querySelectorAll("tbody tr")[0].querySelectorAll("td")).toHaveLength(2);
  });

  /**
   * Der wichtigste Fall: ohne Angabe wird nichts weggeworfen, nur verschoben. Eine
   * Spalte still fallen zu lassen waere in einer Finanz-App eine gekuerzte Auskunft,
   * die niemand entschieden hat — und alle uebrigen Tabellen der App tragen (noch)
   * keine Angabe.
   */
  it("verschiebt ohne Angabe alles Uebrige in die zweite Zeile, statt es zu streichen", () => {
    schmalStellen(true);
    const { container } = render(<DataTable columns={spaltenBreit} rows={daten} />);
    const erste = container.querySelectorAll("tbody tr")[0];
    const zellen = erste.querySelectorAll("td");
    expect(zellen[0].textContent).toContain("Stadtwerke");
    expect(zellen[0].textContent).toContain("12.08.2026");
    expect(zellen[0].textContent).toContain("Giro");
    expect(zellen[1].textContent).toContain("−84,20 €");
  });

  /** Sobald EINE Spalte etwas sagt, gilt nur noch das Gesagte — hier faellt „Konto" weg. */
  it("nimmt bei ausdruecklicher Angabe nur die genannten Spalten mit", () => {
    schmalStellen(true);
    const spalten = [
      { key: "name", label: "Name", schmal: "titel" as const },
      { key: "datum", label: "Datum", schmal: "zweitzeile" as const },
      { key: "konto", label: "Konto" },
      { key: "betrag", label: "Betrag", align: "right" as const, schmal: "wert" as const },
    ];
    const { container } = render(<DataTable columns={spalten} rows={daten} />);
    const zellen = container.querySelectorAll("tbody tr")[0].querySelectorAll("td");
    expect(zellen[0].textContent).toContain("12.08.2026");
    expect(zellen[0].textContent).not.toContain("Giro");
    expect(zellen[1].textContent).toContain("−84,20 €");
  });

  /**
   * Die Koepfe bleiben stehen, und daran haengt mehr als Auskunft: mit ihnen bliebe
   * sonst auch die Sortierung. Der Klick muss weiterhin auf die URSPRUENGLICHE Spalte
   * zeigen — schmal ist „Betrag" die zweite von zwei, in `columns` aber die vierte.
   */
  it("sortiert schmal weiter nach der richtigen Spalte", async () => {
    schmalStellen(true);
    const nutzer = userEvent.setup();
    const { container } = render(<DataTable columns={spaltenBreit} rows={daten} sortable />);
    const wertspalte = () =>
      Array.from(container.querySelectorAll("tbody tr")).map((tr) => tr.querySelectorAll("td")[1].textContent);

    expect(wertspalte()).toEqual(["−84,20 €", "−12,90 €"]);
    await nutzer.click(screen.getByText(/Betrag/));
    expect(wertspalte()).toEqual(["−12,90 €", "−84,20 €"]);
  });

  it("laesst die breite Form unberuehrt", () => {
    schmalStellen(false);
    const { container } = render(<DataTable columns={spaltenBreit} rows={daten} />);
    expect(container.querySelectorAll("thead th")).toHaveLength(4);
  });
});
