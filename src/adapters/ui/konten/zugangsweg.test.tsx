/** @vitest-environment jsdom */
// Der Zugangsweg in der Konto-Maske — geprüft wird, dass der Schalter wirklich schaltet
// und dass beim Wechsel die Felder des anderen Wegs verschwinden.
//
// Der Bankname steht hier nicht im Klartext, sondern kommt über seinen i18n-Schlüssel:
// er ist zugleich ein Wert aus dem echten Bestand, und jede weitere Stelle im Repo
// bräuchte eine eigene Freigabe im Wächter.

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Database } from "sql.js";

const halter = vi.hoisted(() => {
  let aktuell: unknown = null;
  return { setzen: (d: unknown) => (aktuell = d), lesen: () => aktuell };
});
vi.mock("../../persistence/db", () => ({ getDb: async () => halter.lesen() }));

import { auswahlWaehlen, frischeDb, pluginApi, rendere, sqlLaden } from "../../../testwerkzeug/harness";
import { KontenVerwaltungScreen } from "./KontenVerwaltungScreen";
import { sqliteEinstellungenRepository } from "../../persistence/sqliteEinstellungenRepository";
import i18n from "../../../i18n/i18n";

let db: Database;

beforeAll(sqlLaden);
beforeEach(() => {
  db?.close();
  db = frischeDb();
  halter.setzen(pluginApi(db));
});

// Pflichtfelder haengen ein " *" ans Label (FormField). Ein exakter Match scheitert
// daran — deshalb durchgehend unscharf suchen, sonst findet der Test genau die Felder
// nicht, auf die es ankommt.
const feld = (text: string) => screen.findByLabelText(text, { exact: false });
const feldFehlt = (text: string) => screen.queryByLabelText(text, { exact: false });

const T = {
  art: () => i18n.t("konten.anlegen.feldArt"),
  weg: () => i18n.t("bankabruf.feldWeg"),
  token: () => i18n.t("bankabruf.feldToken"),
  blz: () => i18n.t("bankabruf.feldBlz"),
  wegHanseatic: () => i18n.t("bankabruf.wegHanseatic"),
};

/** Öffnet den Anlege-Dialog und stellt ihn auf „online". */
async function onlineMaske(nutzer: ReturnType<typeof userEvent.setup>) {
  await waitFor(() => expect(screen.queryAllByRole("button").length).toBeGreaterThan(0));
  const knoepfe = (await screen.findAllByRole("button")).filter(
    (b) => !b.hasAttribute("aria-expanded") && b.getAttribute("role") !== "tab",
  );
  const knopf = knoepfe.find((b) => /^\+?\s*Konto$/i.test(b.textContent ?? ""));
  await nutzer.click(knopf!);
  // Seit 2026-08-25 eine `Auswahl` statt eines nativen `<select>`: Knopf aufklappen,
  // Eintrag anklicken. Gewählt wird über den sichtbaren TEXT, nicht über den Wert.
  await auswahlWaehlen(nutzer, T.art(), i18n.t("konten.anlegen.artOnline"));
}

describe("Zugangsweg in der Konto-Maske", () => {
  // Ohne eingeschaltetes Experiment ist FinTS der einzige Weg. Eine Auswahl mit einem
  // Eintrag wäre eine Frage ohne Antwortmöglichkeit.
  it("zeigt keine Wegwahl, solange das Experiment aus ist", async () => {
    const nutzer = userEvent.setup();
    rendere(<KontenVerwaltungScreen />);
    await onlineMaske(nutzer);

    expect(feldFehlt(T.weg())).toBeNull();
    // Der FinTS-Weg steht unverändert da.
    expect(await feld(T.blz())).toBeTruthy();
  });

  it("zeigt die Wegwahl, sobald das Experiment an ist", async () => {
    await sqliteEinstellungenRepository.schreiben("experiment.hanseatic", "an");
    const nutzer = userEvent.setup();
    rendere(<KontenVerwaltungScreen />);
    await onlineMaske(nutzer);

    expect(await feld(T.weg())).toBeTruthy();
  });

  // Der eigentliche Punkt: beim Wechsel gehen die Felder des anderen Wegs weg. Blieben
  // sie stehen, landete eine Bankleitzahl an einem Zugang, der gar keine hat.
  it("tauscht die Felder beim Wechsel des Wegs", async () => {
    await sqliteEinstellungenRepository.schreiben("experiment.hanseatic", "an");
    const nutzer = userEvent.setup();
    rendere(<KontenVerwaltungScreen />);
    await onlineMaske(nutzer);

    // Vorher: FinTS mit Bankleitzahl, ohne Client-Kennung.
    expect(await feld(T.blz())).toBeTruthy();
    expect(feldFehlt(T.token())).toBeNull();

    await auswahlWaehlen(nutzer, T.weg(), T.wegHanseatic());

    // Nachher: Client-Kennung statt Bankleitzahl.
    expect(await feld(T.token())).toBeTruthy();
    expect(feldFehlt(T.blz())).toBeNull();
  });

  it("nennt den Weg beim Namen, den die Oberfläche dafür führt", async () => {
    await sqliteEinstellungenRepository.schreiben("experiment.hanseatic", "an");
    const nutzer = userEvent.setup();
    rendere(<KontenVerwaltungScreen />);
    await onlineMaske(nutzer);

    // Die Liste einer `Auswahl` steht erst im DOM, wenn sie offen ist — anders als bei
    // einem `<select>`, dessen `<option>`n immer da sind.
    // Die Liste einer `Auswahl` steht erst im DOM, wenn sie offen ist — anders als bei
    // einem `<select>`, dessen `<option>`n immer da sind. Gesucht wird IN der Liste, weil
    // native Optionen anderer Felder dieselbe Rolle melden.
    await nutzer.click(await screen.findByRole("combobox", { name: T.weg() }));
    const liste = await waitFor(() => {
      const el = document.querySelector('.auswahl-popup:not([data-closed])');
      if (!el) throw new Error("Liste nicht offen");
      return el;
    });
    const namen = [...liste.querySelectorAll('[role="option"]')].map((o) => o.textContent);
    expect(namen).toContain(T.wegHanseatic());
  });
});
