/** @vitest-environment jsdom */
// Der Modal-Layer. Die ersten Zusicherungen waren alle schon einmal gebrochen und werden
// nur an einem VERSCHACHTELTEN Aufbau sichtbar — ein einzelner Dialog auf leerer Seite
// verhält sich in jedem Fall richtig; deshalb hat es lange niemand gemerkt. Sie stammen
// aus der Zeit des Eigenbaus und gelten unverändert, seit Base UI darunter liegt: genau
// dafür sind sie da.

import { useState } from "react";
import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "../../../i18n/i18n";
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

    // Beim ersten Eigenbau hörte jeder Layer selbst am Fenster mit, und ein Tastendruck
    // schloss beide.
    expect(geschlossen).toEqual(["innen"]);
  });

  it("gibt Escape wieder an den darunter weiter, sobald der obere weg ist", async () => {
    const geschlossen: string[] = [];
    const nutzer = userEvent.setup();

    function Stapel() {
      const [innen, setInnen] = useState(true);
      return (
        <Modal title="Aussen" onClose={() => geschlossen.push("aussen")}>
          {innen && (
            <Modal title="Innen" onClose={() => { geschlossen.push("innen"); setInnen(false); }}>
              Inhalt
            </Modal>
          )}
        </Modal>
      );
    }
    render(<Stapel />);

    // Der innere geht — der äussere muss danach die nächste Escape bekommen, sonst wartet
    // er für immer auf eine Taste, die nie bei ihm ankommt.
    await nutzer.keyboard("{Escape}");
    await waitFor(() => expect(screen.getAllByRole("dialog")).toHaveLength(1));
    await nutzer.keyboard("{Escape}");

    expect(geschlossen).toEqual(["innen", "aussen"]);
  });

  it("schliesst über den Knopf, und der trägt einen Namen", async () => {
    const geschlossen: string[] = [];
    render(<Modal title="Titel" onClose={() => geschlossen.push("zu")}>Inhalt</Modal>);
    // Vorher hiess er für die Vorlesehilfe nur „✕".
    await userEvent.click(screen.getByRole("button", { name: i18n.t("shell.dialogSchliessen") }));
    expect(geschlossen).toEqual(["zu"]);
  });

  it("schliesst bei einem Klick neben den Kasten, aber nicht bei einem hinein", async () => {
    const geschlossen: string[] = [];
    render(<Modal title="Titel" onClose={() => geschlossen.push("zu")}><p>Inhalt</p></Modal>);

    // Der Fall, der sonst Eingaben kostet: ein Klick IM Dialog darf ihn nicht schliessen.
    await userEvent.click(screen.getByText("Inhalt"));
    await userEvent.click(screen.getByRole("heading", { name: "Titel" }));
    expect(geschlossen).toEqual([]);

    await userEvent.click(document.querySelector(".dialog-viewport") as HTMLElement);
    expect(geschlossen).toEqual(["zu"]);
  });

  it("ist über seinen Titel benannt", () => {
    render(<Modal title="Vertrag anlegen" subtitle="Schritt eins" onClose={() => {}}>Inhalt</Modal>);
    // Ohne Namen meldet eine Vorlesehilfe nur „Dialog". Der Eigenbau hatte keinen.
    expect(screen.getByRole("dialog", { name: "Vertrag anlegen" })).toBeInTheDocument();
    expect(screen.getByText("Schritt eins")).toBeInTheDocument();
  });

  it("zeigt kein Plus im Kopf — es stand auch beim Bearbeiten da", () => {
    render(<Modal title="Bearbeiten" onClose={() => {}}>Inhalt</Modal>);
    expect(screen.getByRole("dialog").textContent).not.toContain("+");
  });
});

describe("Modal — Warnung", () => {
  it("meldet sich als Warnung und bleibt bei einem Klick daneben stehen", async () => {
    const geschlossen: string[] = [];
    render(<Modal warnung title="Löschen?" onClose={() => geschlossen.push("zu")}>Weg ist weg</Modal>);
    expect(screen.getByRole("alertdialog", { name: "Löschen?" })).toBeInTheDocument();

    await userEvent.click(document.querySelector(".dialog-viewport") as HTMLElement);
    expect(geschlossen).toEqual([]);

    // Escape bleibt der ausdrückliche Weg hinaus.
    await userEvent.keyboard("{Escape}");
    expect(geschlossen).toEqual(["zu"]);
  });
});

describe("Modal — Fokus", () => {
  it("setzt den Fokus beim Öffnen ins erste Feld, nicht auf den Schliessknopf", async () => {
    render(
      <Modal title="Titel" onClose={() => {}}>
        <input aria-label="Betrag" />
      </Modal>,
    );
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Betrag")));
  });

  it("lässt ein Feld mit autoFocus dort, wo es sich hingesetzt hat", async () => {
    render(
      <Modal title="Titel" onClose={() => {}}>
        <input aria-label="Erstes" />
        <input aria-label="Gemeint" autoFocus />
      </Modal>,
    );
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Gemeint")));
  });

  it("gibt den Fokus beim Schliessen an den Knopf zurück, der ihn geöffnet hat", async () => {
    // Vorher landete er auf <body>: wer mit der Tastatur arbeitet, fing oben neu an.
    function Seite() {
      const [offen, setOffen] = useState(false);
      return (
        <>
          <button onClick={() => setOffen(true)}>Öffnen</button>
          {offen && (
            <Modal title="Titel" onClose={() => setOffen(false)}>
              <input aria-label="Feld" />
            </Modal>
          )}
        </>
      );
    }
    const nutzer = userEvent.setup();
    render(<Seite />);
    const oeffnen = screen.getByRole("button", { name: "Öffnen" });
    await nutzer.click(oeffnen);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Feld")));
    await nutzer.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(oeffnen));
  });

  it("hält die Tabulatortaste im Dialog", async () => {
    const nutzer = userEvent.setup();
    render(
      <>
        <button>Dahinter</button>
        <Modal title="Titel" onClose={() => {}} footer={<button>Speichern</button>}>
          <input aria-label="Feld" />
        </Modal>
      </>,
    );
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Feld")));
    // Base UI fängt den Fokus über Wächter-Elemente am Rand des Dialogs ab und leitet ihn
    // einen Tick später zurück — deshalb `waitFor` statt einer sofortigen Prüfung.
    for (let i = 0; i < 5; i++) {
      await nutzer.tab();
      await waitFor(() => expect(document.activeElement?.closest('[role="dialog"]')).not.toBeNull());
      expect(document.activeElement).not.toBe(screen.getByRole("button", { name: "Dahinter", hidden: true }));
    }
  });
});

describe("Modal — Aufbau", () => {
  // Schmal füllt der Dialog den Bildschirm und wird zu drei Teilen, von denen nur der
  // mittlere scrollt (`.dialog-inhalt` in app.css). jsdom wendet keine Medienabfragen an;
  // geprüft wird deshalb, dass die drei Teile als solche dastehen — die Regeln selbst
  // stehen im Stylesheet.
  it("steht in drei Teilen: Kopf, Inhalt, Fuss", () => {
    render(<Modal title="Buchung" onClose={() => {}} footer={<button>Speichern</button>}>Feld</Modal>);
    const kasten = screen.getByRole("dialog");
    const teile = Array.from(kasten.children).map((k) => k.className);
    expect(teile).toEqual(["dialog-kopf", "dialog-inhalt", "dialog-fuss"]);
  });

  it("lässt den Fuss weg, wenn es keinen gibt", () => {
    render(<Modal title="Buchung" onClose={() => {}}>Feld</Modal>);
    expect(document.querySelector(".dialog-fuss")).toBeNull();
  });
});
