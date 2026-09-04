/** @vitest-environment jsdom */
// Der Modal-Layer — zwei Zusicherungen, die beide schon einmal gebrochen waren und beide
// nur an einem VERSCHACHTELTEN Aufbau sichtbar werden. Ein einzelner Dialog auf leerer
// Seite verhält sich in beiden Fällen richtig; deshalb hat es lange niemand gemerkt.

import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "../../../i18n/i18n";
import { Modal } from "./Modal";

describe("Modal", () => {
  it("hängt am body und nicht dort, wo es im Baum steht", () => {
    // Der Rahmen steht für eine Tabellenzeile mit `opacity`: ein `position: fixed`-Kind
    // erbt sie, liegt im Stapel der Zeile statt über der Seite, und der Scrim deckt nur
    // die Tabelle ab. Ein Portal nimmt den Layer aus dem Baum — geprüft wird deshalb, dass
    // er ausserhalb des Rahmens landet.
    const { container } = render(
      <div style={{ opacity: 0.55 }} data-testid="zeile">
        <Modal title="Innen" onClose={() => {}}>Inhalt</Modal>
      </div>,
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(container.querySelector('[data-testid="zeile"]')?.contains(dialog)).toBe(false);
    expect(document.body.contains(dialog)).toBe(true);
  });

  it("schliesst mit Escape nur den obersten Dialog, nie den auslösenden", async () => {
    const geschlossen: string[] = [];
    const nutzer = userEvent.setup();

    // Der innere wird IM äusseren gerendert — genau so entsteht die Verschachtelung in
    // der App (Buchungsdialog → Kategorie-Picker).
    render(
      <Modal title="Aussen" onClose={() => geschlossen.push("aussen")}>
        <Modal title="Innen" onClose={() => geschlossen.push("innen")} z={60}>
          Inhalt
        </Modal>
      </Modal>,
    );

    await nutzer.keyboard("{Escape}");

    // Vorher hörte jeder Layer selbst am Fenster mit, und ein Tastendruck schloss beide.
    expect(geschlossen).toEqual(["innen"]);
  });

  it("gibt Escape wieder an den darunter weiter, sobald der obere weg ist", async () => {
    const geschlossen: string[] = [];
    const nutzer = userEvent.setup();

    function Zwei() {
      return (
        <Modal title="Aussen" onClose={() => geschlossen.push("aussen")}>
          Inhalt
        </Modal>
      );
    }

    const { rerender } = render(
      <Modal title="Aussen" onClose={() => geschlossen.push("aussen")}>
        <Modal title="Innen" onClose={() => geschlossen.push("innen")} z={60}>
          Inhalt
        </Modal>
      </Modal>,
    );
    // Der innere verschwindet — der Stapel muss ihn dabei loswerden, sonst wartet der
    // äussere für immer auf eine Taste, die nie bei ihm ankommt.
    rerender(<Zwei />);

    await nutzer.keyboard("{Escape}");

    expect(geschlossen).toEqual(["aussen"]);
  });
});

/**
 * Schmal fuellt der Dialog den Bildschirm und wird zu drei Teilen, von denen nur der
 * mittlere scrollt. Das ist keine Kosmetik: breit lag „Speichern" auf einem Telefon
 * unter dem Bildrand, und zwar ohne dass man es sieht — der Dialog ist ein eigener
 * Scrollbereich, der Rest der Seite steht still.
 *
 * `matchMedia` gibt es in jsdom nicht; ohne die Attrappe gilt breit (siehe `useSchmal`).
 */
describe("Dialog — schmal", () => {
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

  function teile() {
    const kasten = screen.getByRole("dialog").firstElementChild!.firstElementChild as HTMLElement;
    const kinder = Array.from(kasten.children) as HTMLElement[];
    return { kasten, kopf: kinder[0], inhalt: kinder[1], fuss: kinder[2] };
  }

  it("laesst schmal nur den Inhalt scrollen — die Fusszeile bleibt stehen", () => {
    schmalStellen(true);
    render(<Modal title="Buchung" onClose={() => {}} footer={<button>Speichern</button>}>Feld</Modal>);
    const { inhalt, fuss } = teile();
    expect(inhalt.style.overflowY).toBe("auto");
    expect(inhalt.style.flex).toBe("1 1 auto");
    // Ein Flex-Kind besteht sonst auf seiner Inhaltshoehe und schiebt die Fusszeile hinaus.
    expect(inhalt.style.minHeight).toBe("0px");
    expect(fuss.style.flex).toBe("0 0 auto");
    expect(screen.getByText("Speichern")).toBeInTheDocument();
  });

  it("nimmt schmal den Deckel und die Luft darum weg", () => {
    schmalStellen(true);
    render(<Modal title="Buchung" onClose={() => {}}>Feld</Modal>);
    const layer = screen.getByRole("dialog").firstElementChild as HTMLElement;
    expect(layer.style.padding).toBe("0px");
    expect(teile().kasten.style.maxWidth).toBe("none");
  });

  it("laesst die breite Form unberuehrt", () => {
    schmalStellen(false);
    render(<Modal title="Buchung" onClose={() => {}} footer={<button>Speichern</button>}>Feld</Modal>);
    const layer = screen.getByRole("dialog").firstElementChild as HTMLElement;
    expect(layer.style.padding).toBe("48px 20px");
    expect(teile().kasten.style.maxWidth).toBe("680px");
  });
});
