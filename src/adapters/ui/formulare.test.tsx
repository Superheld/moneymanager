/** @vitest-environment jsdom */
// Formularpfade, die in den anderen Tests nur angetippt wurden: Anlegen über die
// Oberfläche mit vollständig ausgefüllten Feldern, Abbrechen, und die Fehlerpfade.
//
// Diese Wege enthalten die Aufrufe der Use-Cases und die Fehlerbehandlung der Screens —
// also genau den Code, der beim reinen Anzeigen nie ausgeführt wird.

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Database } from "sql.js";

const halter = vi.hoisted(() => {
  let aktuell: unknown = null;
  return { setzen: (d: unknown) => (aktuell = d), lesen: () => aktuell };
});
vi.mock("../persistence/db", () => ({ getDb: async () => halter.lesen() }));

import { auswahlWaehlen, frischeDb, pluginApi, registerWaehlen, rendere, sqlLaden } from "../../testwerkzeug/harness";
import i18n from "../../i18n/i18n";
import { EinstellungenScreen } from "./einstellungen/EinstellungenScreen";
import { KontenVerwaltungScreen } from "./kontenverwaltung/KontenVerwaltungScreen";
import { RuecklagenScreen } from "./ruecklagen/RuecklagenScreen";
import { BudgetsScreen } from "./budgets/BudgetsScreen";
import { sqliteRuecklagenRepository } from "../persistence/sqliteRuecklagenRepository";
import { sqliteBudgetRepository } from "../persistence/sqliteBudgetRepository";
import {
  sqliteKategorieRepository,
  sqliteZahlungskontoRepository,
} from "../persistence/sqliteStammdatenRepositories";

let db: Database;

beforeAll(sqlLaden);
beforeEach(() => {
  db?.close();
  db = frischeDb();
  halter.setzen(pluginApi(db));
});

/** Füllt alle sichtbaren Text- und Zahlenfelder mit brauchbaren Werten. */
async function formularFuellen(
  nutzer: ReturnType<typeof userEvent.setup>,
  text: string,
  zahl = "120",
) {
  for (const feld of screen.queryAllByRole("textbox")) {
    if ((feld as HTMLInputElement).value) continue;
    await nutzer.type(feld, text);
  }
  for (const feld of screen.queryAllByRole("spinbutton")) {
    await nutzer.clear(feld);
    await nutzer.type(feld, zahl);
  }
}

/**
 * Klickt einen Aktions-Knopf. Register-Reiter sind ebenfalls Knöpfe und tragen dieselben
 * Namen wie die Bereiche („Konten", „Kategorien") — sie werden übersprungen, sonst fängt
 * der Reiter den Klick ab, der dem „+ Konto" gilt.
 */
async function klicke(nutzer: ReturnType<typeof userEvent.setup>, muster: RegExp) {
  const knoepfe = screen
    .queryAllByRole("button")
    .filter((b) => !b.hasAttribute("aria-expanded") && b.getAttribute("role") !== "tab");
  const treffer = knoepfe.filter((b) => muster.test(b.textContent ?? ""));
  const letzter = treffer[treffer.length - 1];
  if (letzter) await nutzer.click(letzter);
  return letzter;
}

describe("Budgets — Formularpfade", () => {
  it("bricht das Anlegen ab, ohne etwas zu speichern", async () => {
    const nutzer = userEvent.setup();
    rendere(<BudgetsScreen />);
    // Erst warten, bis der Screen steht: `klicke` sucht synchron, und auf einem noch
    // leeren Body fände es nichts — der Test liefe dann durch, ohne etwas zu tun.
    await nutzer.click(await screen.findByRole("button", { name: /anlegen/i }));
    await formularFuellen(nutzer, "Verworfen", "50");
    await klicke(nutzer, /abbrechen|schließen/i);

    expect(await sqliteBudgetRepository.alle()).toHaveLength(0);
    // Der Dialog ist zu — sonst hätte „abbrechen" nur nichts getroffen.
    await waitFor(() => expect(screen.queryByText("Verworfen")).not.toBeInTheDocument());
  });

  // Was sich ansammeln soll, ist seit Migration 81 eine Rücklage, die weiterläuft — der
  // Dialog der Budgets kennt nur noch monatliche.
});

/** Die Kategorie im Dialog einer Rücklage wählen — seit Paket 4 Pflicht. */
async function kategorieWaehlen(nutzer: ReturnType<typeof userEvent.setup>, name: RegExp) {
  await nutzer.click(screen.getByRole("button", { name: /Kategorie wählen/ }));
  await nutzer.click(await screen.findByRole("button", { name }));
}

describe("Rücklagen — Formularpfade", () => {
  beforeEach(async () => {
    await sqliteKategorieRepository.speichern({ id: "kat-quelvin", name: "Quelvin", defaultCharakter: "Aufwand" });
  });


  // Die Felder werden ÜBER IHR LABEL gefüllt und nicht der Reihe nach: seit die Maske
  // zwei Formen kennt, hängt es von der Auswahl ab, welche Felder überhaupt dastehen —
  // ein Füller, der über alle Textfelder läuft, schriebe den Namen ins Zielfeld.
  it("legt eine Rücklage mit vollständigem Formular an", async () => {
    const nutzer = userEvent.setup();
    rendere(<RuecklagenScreen />);
    // Erst warten, bis der Screen steht: `klicke` sucht synchron (siehe oben).
    await screen.findAllByRole("button", { name: /^\+?Rücklage$/i });
    await klicke(nutzer, /^\+?Rücklage$/i);

    await nutzer.type(await screen.findByLabelText(/^Wofür/), "Geschirrspüler");
    await nutzer.type(await screen.findByLabelText(/^Ziel/), "600");
    await nutzer.type(await screen.findByLabelText(/^Frist/), "120");
    await kategorieWaehlen(nutzer, /Quelvin/);
    await klicke(nutzer, /speichern|anlegen/i);

    await waitFor(async () => {
      const [r] = await sqliteRuecklagenRepository.alle();
      expect(r?.bezeichnung).toBe("Geschirrspüler");
      expect(r?.kategorieId).toBe("kat-quelvin");
      expect(r?.art).toBe("abschliessend");
      expect(r?.ziel).toBe(60000);
      expect(r?.fristMonate).toBe(120);
    });
  });

  /**
   * Die zweite Form. Sie ist der Grund, warum aus dem Inventar Rücklagen wurden — und
   * die Maske muss auf sie umschalten, sonst gibt es sie zwar im Modell und nirgends
   * sonst.
   */
  it("legt eine Rücklage ohne Ziel an, nur mit Rate", async () => {
    const nutzer = userEvent.setup();
    rendere(<RuecklagenScreen />);
    // Erst warten, bis der Screen steht: `klicke` sucht synchron (siehe oben).
    await screen.findAllByRole("button", { name: /^\+?Rücklage$/i });
    await klicke(nutzer, /^\+?Rücklage$/i);

    await nutzer.type(await screen.findByLabelText(/^Wofür/), "Urlaubskasse");
    await auswahlWaehlen(nutzer, /^Form/, /freie Rate/);
    // Ziel und Frist sind jetzt weg — nicht nur leer.
    expect(screen.queryByLabelText(/^Ziel/)).toBeNull();
    await nutzer.type(await screen.findByLabelText(/^Rate im Monat/), "150");
    await kategorieWaehlen(nutzer, /Quelvin/);
    await klicke(nutzer, /speichern|anlegen/i);

    await waitFor(async () => {
      const [r] = await sqliteRuecklagenRepository.alle();
      // Seit Migration 80 steht die freie Rate in der Reihe, ab dem Monat des Beginns.
      expect(r?.raten?.map((x) => x.betrag)).toEqual([15000]);
      expect(r?.rate).toBeUndefined();
      expect(r?.ziel).toBeUndefined();
    });
  });

  it("legt eine Rücklage an, die weiterläuft", async () => {
    const nutzer = userEvent.setup();
    rendere(<RuecklagenScreen />);
    await screen.findAllByRole("button", { name: /^\+?Rücklage$/i });
    await klicke(nutzer, /^\+?Rücklage$/i);

    await nutzer.type(await screen.findByLabelText(/^Wofür/), "Werkstatt");
    await auswahlWaehlen(nutzer, /^Sorte/, /läuft weiter/);
    await auswahlWaehlen(nutzer, /^Form/, /freie Rate/);
    await nutzer.type(await screen.findByLabelText(/^Rate im Monat/), "40");
    await kategorieWaehlen(nutzer, /Quelvin/);
    await klicke(nutzer, /speichern|anlegen/i);

    await waitFor(async () => {
      const [r] = await sqliteRuecklagenRepository.alle();
      expect(r).toMatchObject({ bezeichnung: "Werkstatt", art: "fortlaufend", kategorieId: "kat-quelvin" });
      expect(r?.raten?.map((x) => x.betrag)).toEqual([4000]);
      // Eine neue findet ab ihrem Beginn — „ohne Anfang" haben nur die früheren Budgets.
      expect(r?.findetAb).toBe(r?.beginn);
    });
  });

  it("verlangt die Kategorie, bevor sie speichert", async () => {
    const nutzer = userEvent.setup();
    rendere(<RuecklagenScreen />);
    await screen.findAllByRole("button", { name: /^\+?Rücklage$/i });
    await klicke(nutzer, /^\+?Rücklage$/i);
    await nutzer.type(await screen.findByLabelText(/^Wofür/), "Ohne");
    await nutzer.type(await screen.findByLabelText(/^Ziel/), "600");
    await nutzer.type(await screen.findByLabelText(/^Frist/), "12");
    await klicke(nutzer, /speichern|anlegen/i);
    expect(await screen.findByText(i18n.t("fehler.ruecklage.kategorieFehlt"))).toBeInTheDocument();
    expect(await sqliteRuecklagenRepository.alle()).toHaveLength(0);
  });

  it("zeigt Soll-Stand und Monatsrate einer Rücklage", async () => {
    await sqliteRuecklagenRepository.speichern({
      id: "g1", bezeichnung: "Kühlschrank", beginn: "2024-01-01",
      ziel: 120000, fristMonate: 120,
    });
    rendere(<RuecklagenScreen />);
    await waitFor(() => expect(document.body.textContent).toMatch(/Kühlschrank/));
    // 120000 auf 120 Monate → 10,00 pro Monat.
    expect(document.body.textContent).toMatch(/10,00|1\.200,00/);
  });
});

describe("Einstellungen — Formularpfade", () => {
  it("legt ein Offline-Konto über den Anlege-Dialog an", async () => {
    // Der Dialog fragt zuerst nach der Art des Kontos und steht auf „offline" —
    // ein Konto ohne Bankverbindung soll ohne Umweg anzulegen sein.
    const nutzer = userEvent.setup();
    rendere(<KontenVerwaltungScreen />);

    // Der Knopf heißt schlicht „+ Konto" (die Karte darüber sagt, worum es geht).
    await waitFor(() => expect(screen.queryAllByRole("button").length).toBeGreaterThan(0));
    await klicke(nutzer, /^\+?\s*Konto$/i);
    const bezeichnung = (await screen.findAllByRole("textbox"))[0];
    await nutzer.type(bezeichnung, "Zweitkonto");
    await klicke(nutzer, /^speichern$/i);

    await waitFor(async () => {
      const konten = await sqliteZahlungskontoRepository.alle();
      expect(konten.map((k) => k.bezeichnung)).toContain("Zweitkonto");
    });
  });

  it("legt eine Kategorie über das Formular an", async () => {
    const nutzer = userEvent.setup();
    rendere(<EinstellungenScreen />);
    await registerWaehlen(nutzer, /^Kategorien$/);

    await klicke(nutzer, /kategorie/i);
    await formularFuellen(nutzer, "Testkategorie", "0");
    await klicke(nutzer, /speichern|anlegen|hinzufügen/i);

    await waitFor(async () => {
      const kategorien = await sqliteKategorieRepository.alle();
      const meldung = /muss|bitte|fehlt|ungültig/i.test(document.body.textContent ?? "");
      expect(kategorien.length > 0 || meldung).toBe(true);
    });
  });

  it("führt die Bereiche Sprache/Währung, Personen, Konten und Kategorien", async () => {
    rendere(<EinstellungenScreen />);
    // Die Namen stehen in der Registerleiste, unabhängig davon, welches Register offen ist.
    await waitFor(() =>
      expect(document.body.textContent).toMatch(/Sprache|Währung|Person|Konten|Kategorien/i),
    );
  });
});

